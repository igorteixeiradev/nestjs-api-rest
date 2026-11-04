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
  Query,
} from '@nestjs/common';
import { PostsService } from './posts.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostEntity } from './entities/post.entity.js';
import { Auth } from '../auth/auth.decorator.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { PaginationQueryDto } from './dto/pagination.dto.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(
    @Body() createPostDto: CreatePostDto,
    @Auth() actor: UserEntity,
  ): Promise<PostEntity> {
    return await this.postsService.create(createPostDto, actor);
  }

  @Get()
  async findAll(
    @Query() { page, limit }: PaginationQueryDto,
    @Auth() actor: UserEntity,
  ) {
    return await this.postsService.findAll(page, limit, actor);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Auth() actor: UserEntity,
  ): Promise<PostEntity> {
    return await this.postsService.findOne(id, actor);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Auth() actor: UserEntity,
  ): Promise<PostEntity> {
    return await this.postsService.update(id, updatePostDto, actor);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Auth() actor: UserEntity,
  ): Promise<void> {
    return await this.postsService.remove(id, actor);
  }
}
