import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants.js';
import { UsersService } from '../users/users.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, UsersService],
  imports: [
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '120m', algorithm: 'HS256' },
    }),
  ],
})
export class AuthModule {}
