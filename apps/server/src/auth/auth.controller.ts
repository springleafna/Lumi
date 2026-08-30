import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { LoginRequest, RegisterRequest, UserDto } from '@lumi/shared';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginRequest) {
    return this.authService.login(body);
  }

  @Post('register')
  register(@Body() body: RegisterRequest) {
    return this.authService.register(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserDto) {
    return user;
  }
}
