import { COMMON_SHADER_CODE } from './common.js';

export const WORKGROUP_SUM_SHADER_CODE = `
    var<workgroup> workgroup_sums : array<f32, WORKGROUP_SIZE>;

    fn sum_workgroup(local_index : u32, value : f32) -> f32 {
        workgroup_sums[local_index] = value;

        workgroupBarrier();

        for (var stride = WORKGROUP_SIZE / 2u; stride > 0u; stride = stride / 2u) {
            if (local_index < stride) {
                workgroup_sums[local_index] += workgroup_sums[local_index + stride];
            }

            workgroupBarrier();
        }

        return workgroup_sums[0];
    }
`;

export const PARTIAL_DOT_PRODUCT_SHADER_CODE = `
    ${COMMON_SHADER_CODE}

    struct DotProductParameters {
        left_stride : u32,
    }

    @group(0) @binding(0) var<uniform> parameters               : SolverParameters;
    @group(0) @binding(1) var<uniform> dot_product_parameters   : DotProductParameters;
    @group(0) @binding(2) var<storage, read> left_values        : array<f32>;
    @group(0) @binding(3) var<storage, read> right_values       : array<f32>;
    @group(0) @binding(4) var<storage, read_write> partial_sums : array<f32>;

    ${WORKGROUP_SUM_SHADER_CODE}

    @compute @workgroup_size(WORKGROUP_SIZE)
    fn main(@builtin(local_invocation_index) local_index : u32, @builtin(workgroup_id) workgroup_id : vec3u) {
        let row_index     = workgroup_id.y;
        let row_offset    = row_index * dot_product_parameters.left_stride;
        let thread_stride = parameters.group_count * WORKGROUP_SIZE;

        var sum = 0.0;

        for (var node_index = workgroup_id.x * WORKGROUP_SIZE + local_index; node_index < parameters.node_count; node_index += thread_stride) {
            sum += left_values[row_offset + node_index] * right_values[node_index];
        }

        let total = sum_workgroup(local_index, sum);

        if (local_index == 0u) {
            partial_sums[row_index * parameters.group_count + workgroup_id.x] = total;
        }
    }
`;

export const FINAL_SUM_SHADER_CODE = `
    ${COMMON_SHADER_CODE}

    struct ReductionParameters {
        output_offset : u32,
    }

    @group(0) @binding(0) var<uniform> parameters           : SolverParameters;
    @group(0) @binding(1) var<uniform> reduction_parameters : ReductionParameters;
    @group(0) @binding(2) var<storage, read> partial_sums   : array<f32>;
    @group(0) @binding(3) var<storage, read_write> scalars  : array<f32>;

    ${WORKGROUP_SUM_SHADER_CODE}

    @compute @workgroup_size(WORKGROUP_SIZE)
    fn main(@builtin(local_invocation_index) local_index : u32, @builtin(workgroup_id) workgroup_id : vec3u) {
        let row_index = workgroup_id.x;

        var sum = 0.0;

        for (var group_index = local_index; group_index < parameters.group_count; group_index += WORKGROUP_SIZE) {
            sum += partial_sums[row_index * parameters.group_count + group_index];
        }

        let total = sum_workgroup(local_index, sum);

        if (local_index == 0u) {
            scalars[reduction_parameters.output_offset + row_index] = total * parameters.cell_volume;
        }
    }
`;
