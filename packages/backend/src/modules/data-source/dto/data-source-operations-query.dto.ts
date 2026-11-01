import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * GET /data-source/operations 查询参数（PR D）。
 *
 * pageId 与 pageVersion 均必填且 pageVersion 为 ≥1 整数——与 B 执行端点
 * 「无版本/浮动版本拒绝」一致，目录不提供 latest 语义。
 */
export class DataSourceOperationsQueryDto {
  @IsString()
  @IsNotEmpty()
  pageId!: string;

  @IsInt()
  @Min(1)
  pageVersion!: number;
}
