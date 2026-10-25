import { WORKGROUP_SIZE, SCALAR_OFFSETS } from '../constants.js';

export const COMMON_SHADER_CODE = `
    const WORKGROUP_SIZE : u32 = ${WORKGROUP_SIZE}u;

    const COEFFICIENTS_OFFSET : u32 = ${SCALAR_OFFSETS.COEFFICIENTS}u;
    const NORM_OFFSET         : u32 = ${SCALAR_OFFSETS.NORM}u;
    const ENERGY_OFFSET       : u32 = ${SCALAR_OFFSETS.ENERGY}u;

    struct SolverParameters {
        grid_size        : u32,
        node_count       : u32,
        state_count      : u32,
        group_count      : u32,
        diffusion_factor : f32,
        time_step        : f32,
        kinetic_factor   : f32,
        cell_volume      : f32,
    }

    fn get_node_index(invocation_id : vec3u, workgroup_count : vec3u) -> u32 {
        return invocation_id.x + invocation_id.y * workgroup_count.x * WORKGROUP_SIZE;
    }
`;

export const STENCIL_SHADER_CODE = `
    fn sum_neighbours(node_index : u32) -> f32 {
        let grid_size  = parameters.grid_size;
        let layer_size = grid_size * grid_size;

        let i = node_index % grid_size;
        let j = (node_index / grid_size) % grid_size;
        let k = node_index / layer_size;

        var sum = 0.0;

        if (i > 0u) {
            sum += state[node_index - 1u];
        }

        if (i + 1u < grid_size) {
            sum += state[node_index + 1u];
        }

        if (j > 0u) {
            sum += state[node_index - grid_size];
        }

        if (j + 1u < grid_size) {
            sum += state[node_index + grid_size];
        }

        if (k > 0u) {
            sum += state[node_index - layer_size];
        }

        if (k + 1u < grid_size) {
            sum += state[node_index + layer_size];
        }

        return sum;
    }

    fn apply_hamiltonian(node_index : u32) -> f32 {
        let value = state[node_index];

        return -parameters.kinetic_factor * (sum_neighbours(node_index) - 6.0 * value) + potential[node_index] * value;
    }
`;
