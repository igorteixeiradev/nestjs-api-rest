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
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<UserEntity> {
    const userExists = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) throw new BadRequestException('User already exists');

    const saltOrRounds = 10;

    const hash = await bcrypt.hash(createUserDto.password, saltOrRounds);

    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: hash,
      },
    });

    return new UserEntity({ ...user });
  }

  async findAll(): Promise<UserEntity[]> {
    return await this.prisma.user.findMany();
  }

  async findOne(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) throw new NotFoundException(`User with id ${id} not found`);

    return new UserEntity({ ...user });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserEntity> {
    const userExists = await this.findOne(id);

    const updatedUser = await this.prisma.user.update({
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

    await this.prisma.user.delete({
      where: { id },
    });
  }
}
