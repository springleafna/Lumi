import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { LoginRequest, LoginResponse } from '@lumi/shared';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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

    const publicUser = { id: user.id, username: user.username };
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });

    return { accessToken, user: publicUser };
  }
}
