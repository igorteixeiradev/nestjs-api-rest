import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(private prismaService: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<UserEntity> {
    const userExists = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) throw new BadRequestException('User already exists');

    const saltOrRounds = 10;

    const hash = await bcrypt.hash(createUserDto.password, saltOrRounds);

    const user = await this.prismaService.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: hash,
        role: createUserDto.role,
      },
    });

    return new UserEntity({ ...user });
  }

  findAll() {
    return `This action returns all users`;
  }

  async findOne(id: string): Promise<UserEntity> {
    const user = await this.prismaService.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException('User not found');

    return new UserEntity({ ...user });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserEntity> {
    const userExists = await this.findOne(id);

    const updatedUser = await this.prismaService.user.update({
      where: { id: userExists.id },
      data: {
        name: updateUserDto.name,
        email: updateUserDto.email,
        password: updateUserDto.password,
        role: updateUserDto.role,
      },
    });

    return new UserEntity({ ...updatedUser });
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prismaService.user.delete({
      where: { id },
    });
  }
}
