import { COMMON_SHADER_CODE } from './common.js';

export const ORTHOGONALIZATION_SHADER_CODE = `
    ${COMMON_SHADER_CODE}

    @group(0) @binding(0) var<uniform> parameters                : SolverParameters;
    @group(0) @binding(1) var<storage, read> committed_states    : array<f32>;
    @group(0) @binding(2) var<storage, read> scalars             : array<f32>;
    @group(0) @binding(3) var<storage, read_write> evolved_state : array<f32>;

    @compute @workgroup_size(WORKGROUP_SIZE)
    fn main(@builtin(global_invocation_id) invocation_id : vec3u, @builtin(num_workgroups) workgroup_count : vec3u) {
        let node_index = get_node_index(invocation_id, workgroup_count);

        if (node_index >= parameters.node_count) {
            return;
        }

        var projection = 0.0;

        for (var state_index = 0u; state_index < parameters.state_count; state_index++) {
            let coefficient = scalars[COEFFICIENTS_OFFSET + state_index];

            projection += coefficient * committed_states[state_index * parameters.node_count + node_index];
        }

        evolved_state[node_index] -= projection;
    }
`;
