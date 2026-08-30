import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { LoginRequest, LoginResponse, RegisterRequest } from '@lumi/shared';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(input: LoginRequest): Promise<LoginResponse> {
    const username = input.username?.trim();
    const password = input.password;
    if (!username || !password) {
      throw new BadRequestException('请输入用户名和密码');
    }

    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return this.issueToken(user);
  }

  async register(input: RegisterRequest): Promise<LoginResponse> {
    if (!this.registerEnabled()) {
      throw new ForbiddenException('注册功能已关闭，请联系管理员');
    }

    const username = input.username?.trim();
    const password = input.password;
    if (!username || !password) {
      throw new BadRequestException('请输入用户名和密码');
    }
    if (username.length < 2 || username.length > 32) {
      throw new BadRequestException('用户名长度需为 2-32 个字符');
    }
    if (password.length < 6 || password.length > 64) {
      throw new BadRequestException('密码长度需为 6-64 位');
    }

    const existing = await this.usersService.findByUsername(username);
    if (existing) {
      throw new BadRequestException('用户名已被占用');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.createUser({ username, password: passwordHash });
    return this.issueToken(user);
  }

  /** 注册默认开放，设置 AUTH_REGISTER_ENABLED=false 可关闭。 */
  private registerEnabled(): boolean {
    return this.configService.get<string>('AUTH_REGISTER_ENABLED') !== 'false';
  }

  private issueToken(user: { id: string; username: string }): LoginResponse {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });
    return { accessToken, user: { id: user.id, username: user.username } };
  }
}
