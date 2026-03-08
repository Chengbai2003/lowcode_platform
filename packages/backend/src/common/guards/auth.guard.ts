import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly apiSecret: string;

  constructor(private configService: ConfigService) {
    // 从环境变量读取 API_SECRET，提供默认值
    this.apiSecret =
      this.configService.get<string>('API_SECRET') || 'dev-secret-token-change-in-production';

    // 开发环境下记录警告，提醒用户生产环境应修改 token
    if (this.apiSecret === 'dev-secret-token-change-in-production') {
      this.logger.warn('Using default API_SECRET. Please change this in production for security.');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      this.logger.warn(`Missing Authorization header from ${request.ip}`);
      throw new UnauthorizedException(
        'Authentication token is missing. Format: Authorization: Bearer <token>',
      );
    }

    if (token !== this.apiSecret) {
      this.logger.warn(`Invalid token used by ${request.ip}`);
      throw new UnauthorizedException('Authentication failed: Invalid token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
