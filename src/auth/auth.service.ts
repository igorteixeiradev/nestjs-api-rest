import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginAuthDto } from './dto/login-auth.dto.js';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import * as bcrypt from 'bcrypt';
import { AuthJwt } from './entities/auth.entity.js';
import { UserEntity } from '../users/entities/user.entity.js';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async login(loginAuthDto: LoginAuthDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginAuthDto.email },
    });

    if (
      !user ||
      !(await bcrypt.compare(loginAuthDto.password, user.password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.name, role: user.role };
    const userEntity = new UserEntity(user);

    return new AuthJwt({
      accessToken: await this.jwtService.signAsync(payload),
      user: userEntity,
    });
  }
}
