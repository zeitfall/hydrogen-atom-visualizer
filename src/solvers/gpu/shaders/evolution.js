import { COMMON_SHADER_CODE, STENCIL_SHADER_CODE } from './common.js';

export const EVOLUTION_SHADER_CODE = `
    ${COMMON_SHADER_CODE}

    @group(0) @binding(0) var<uniform> parameters                : SolverParameters;
    @group(0) @binding(1) var<storage, read> state               : array<f32>;
    @group(0) @binding(2) var<storage, read> potential           : array<f32>;
    @group(0) @binding(3) var<storage, read_write> evolved_state : array<f32>;

    ${STENCIL_SHADER_CODE}

    @compute @workgroup_size(WORKGROUP_SIZE)
    fn main(@builtin(global_invocation_id) invocation_id : vec3u, @builtin(num_workgroups) workgroup_count : vec3u) {
        let node_index = get_node_index(invocation_id, workgroup_count);

        if (node_index >= parameters.node_count) {
            return;
        }

        let value = state[node_index];

        evolved_state[node_index] = value
            + parameters.diffusion_factor * (sum_neighbours(node_index) - 6.0 * value)
            - parameters.time_step * potential[node_index] * value;
    }
`;
