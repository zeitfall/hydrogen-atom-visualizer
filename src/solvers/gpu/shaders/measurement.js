import { COMMON_SHADER_CODE, STENCIL_SHADER_CODE } from './common.js';
import { WORKGROUP_SUM_SHADER_CODE } from './reduction.js';

export const PARTIAL_ENERGY_SHADER_CODE = `
    ${COMMON_SHADER_CODE}

    @group(0) @binding(0) var<uniform> parameters               : SolverParameters;
    @group(0) @binding(1) var<storage, read> state              : array<f32>;
    @group(0) @binding(2) var<storage, read> potential          : array<f32>;
    @group(0) @binding(3) var<storage, read_write> partial_sums : array<f32>;

    ${STENCIL_SHADER_CODE}

    ${WORKGROUP_SUM_SHADER_CODE}

    @compute @workgroup_size(WORKGROUP_SIZE)
    fn main(@builtin(local_invocation_index) local_index : u32, @builtin(workgroup_id) workgroup_id : vec3u) {
        let thread_stride = parameters.group_count * WORKGROUP_SIZE;

        var sum = 0.0;

        for (var node_index = workgroup_id.x * WORKGROUP_SIZE + local_index; node_index < parameters.node_count; node_index += thread_stride) {
            sum += state[node_index] * apply_hamiltonian(node_index);
        }

        let total = sum_workgroup(local_index, sum);

        if (local_index == 0u) {
            partial_sums[workgroup_id.x] = total;
        }
    }
`;

// NOTE: The residual is accumulated as (H psi - E psi)^2 directly,
// because ||H psi||^2 - E^2 loses all precision in float32.
export const PARTIAL_RESIDUAL_SHADER_CODE = `
    ${COMMON_SHADER_CODE}

    @group(0) @binding(0) var<uniform> parameters               : SolverParameters;
    @group(0) @binding(1) var<storage, read> state              : array<f32>;
    @group(0) @binding(2) var<storage, read> potential          : array<f32>;
    @group(0) @binding(3) var<storage, read> scalars            : array<f32>;
    @group(0) @binding(4) var<storage, read_write> partial_sums : array<f32>;

    ${STENCIL_SHADER_CODE}

    ${WORKGROUP_SUM_SHADER_CODE}

    @compute @workgroup_size(WORKGROUP_SIZE)
    fn main(@builtin(local_invocation_index) local_index : u32, @builtin(workgroup_id) workgroup_id : vec3u) {
        let energy        = scalars[ENERGY_OFFSET];
        let thread_stride = parameters.group_count * WORKGROUP_SIZE;

        var sum = 0.0;

        for (var node_index = workgroup_id.x * WORKGROUP_SIZE + local_index; node_index < parameters.node_count; node_index += thread_stride) {
            let deviation = apply_hamiltonian(node_index) - energy * state[node_index];

            sum += deviation * deviation;
        }

        let total = sum_workgroup(local_index, sum);

        if (local_index == 0u) {
            partial_sums[workgroup_id.x] = total;
        }
    }
`;
