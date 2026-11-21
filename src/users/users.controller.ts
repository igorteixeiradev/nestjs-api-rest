import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { Auth } from '../auth/auth.decorator.js';
import { CaslAbilityService } from '../casl/casl-ability/casl-ability.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly casl: CaslAbilityService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createUserDto: CreateUserDto,
    @Auth() actor: UserEntity,
  ): Promise<UserEntity> {
    this.casl.authorize(actor, 'create', 'User');
    return await this.usersService.create(createUserDto);
  }

  @Get()
  async findAll(@Auth() actor: UserEntity): Promise<UserEntity[]> {
    return await this.usersService.findAll(actor);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Auth() actor: UserEntity,
  ): Promise<UserEntity> {
    return await this.usersService.findOne(id, actor);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Auth() actor: UserEntity,
  ): Promise<UserEntity> {
    return await this.usersService.update(id, updateUserDto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Auth() actor: UserEntity,
  ): Promise<void> {
    return await this.usersService.remove(id, actor);
  }
}
