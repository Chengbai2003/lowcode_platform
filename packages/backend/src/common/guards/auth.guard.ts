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
    const apiSecret = this.configService.get<string>('API_SECRET');
    if (!apiSecret) {
      this.logger.error('API_SECRET is not configured.');
      throw new Error('API_SECRET must be configured.');
    }

    this.apiSecret = apiSecret;
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
