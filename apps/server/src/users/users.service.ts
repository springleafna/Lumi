import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  findPublicById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true },
    });
  }
}
