import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    const validSecret = process.env.API_SECRET;

    if (!validSecret) {
      this.logger.warn('API_SECRET is not configured in environment variables');
      // 出于安全防备，如果后端忘记配置秘钥，就必须全盘锁死。
      // 可以根据实际业务要求进行宽容处理，但基于安全性考虑，推荐拒绝访问。
      throw new UnauthorizedException('Server configuration error');
    }

    if (!token) {
      this.logger.warn(`Missing Authorization header from ${request.ip}`);
      throw new UnauthorizedException('Authentication token is missing');
    }

    if (token !== validSecret) {
      this.logger.warn(`Invalid token used by ${request.ip}`);
      throw new UnauthorizedException('Authentication failed');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
