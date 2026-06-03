import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserDto } from '@lumi/shared';
import { UsersService } from '../users/users.service';

type JwtPayload = {
  sub: string;
  username: string;
};

type RequestWithUser = Request & {
  user?: UserDto;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.getBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('未登录');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersService.findPublicById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('未登录');
      }

      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('未登录');
    }
  }

  private getBearerToken(request: Request): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) return null;

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
