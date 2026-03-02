import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../../common/guards/auth.guard";
import { AISession, AISessionMeta } from "@lowcode-platform/types";

@Controller("ai/sessions")
@UseGuards(AuthGuard)
export class AISessionController {
  private readonly logger = new Logger(AISessionController.name);

  // TODO: 这是临时实现，未来应该使用数据库持久化
  // 当前使用 Map 进行内存存储，仅用于开发测试
  private sessions: Map<string, AISession> = new Map();
  private sessionMetas: Map<string, AISessionMeta> = new Map();

  /**
   * 获取会话列表
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSessions(@Query("projectId") projectId?: string) {
    try {
      let sessionArray = Array.from(this.sessionMetas.values());

      // 如果指定了 projectId，则过滤出关联该项目的会话
      if (projectId) {
        sessionArray = sessionArray.filter(
          (meta) => meta.projectId === projectId,
        );
      }

      // 按更新时间倒序排列
      sessionArray.sort((a, b) => b.updatedAt - a.updatedAt);

      this.logger.log(
        `[getSessions] Returning ${sessionArray.length} sessions, projectId: ${projectId || "all"}`,
      );

      return { success: true, data: sessionArray };
    } catch (error) {
      this.logger.error("Failed to get sessions:", error);
      throw error;
    }
  }

  /**
   * 获取特定会话
   */
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getSession(@Param("id") id: string) {
    try {
      const session = this.sessions.get(id);

      if (!session) {
        this.logger.warn(`[getSession] Session not found: ${id}`);
        return { success: false, data: null, message: "Session not found" };
      }

      this.logger.log(`[getSession] Returning session: ${id}`);
      return { success: true, data: session };
    } catch (error) {
      this.logger.error("Failed to get session:", error);
      throw error;
    }
  }

  /**
   * 创建或更新会话
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async createSession(@Body() session: AISession) {
    try {
      this.logger.log(
        `[createSession] Creating/updating session: ${session.id}`,
      );

      // 更新会话数据
      this.sessions.set(session.id, session);

      // 从 session 中提取元数据（不包含 messages）
      const { messages, ...meta } = session;

      // 更新会话元数据
      this.sessionMetas.set(session.id, meta);

      return { success: true, data: session };
    } catch (error) {
      this.logger.error("Failed to create session:", error);
      throw error;
    }
  }

  /**
   * 更新会话
   */
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateSession(@Param("id") id: string, @Body() session: AISession) {
    try {
      this.logger.log(`[updateSession] Updating session: ${id}`);

      // 更新会话数据
      this.sessions.set(id, session);

      // 从 session 中提取元数据（不包含 messages）
      const { messages, ...meta } = session;

      // 更新会话元数据
      this.sessionMetas.set(id, meta);

      return { success: true, data: session };
    } catch (error) {
      this.logger.error("Failed to update session:", error);
      throw error;
    }
  }

  /**
   * 删除会话
   */
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async deleteSession(@Param("id") id: string) {
    try {
      this.logger.log(`[deleteSession] Deleting session: ${id}`);

      this.sessions.delete(id);
      this.sessionMetas.delete(id);

      return { success: true, data: null };
    } catch (error) {
      this.logger.error("Failed to delete session:", error);
      throw error;
    }
  }
}
