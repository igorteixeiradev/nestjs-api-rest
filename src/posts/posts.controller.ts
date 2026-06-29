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
    @Auth() user: UserEntity,
  ): Promise<PostEntity> {
    return await this.postsService.create({
      ...createPostDto,
      authorId: user.id,
    });
  }

  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    const { page = 1, limit = 10 } = query;
    return await this.postsService.findAll(+page, +limit);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PostEntity> {
    return await this.postsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
  ): Promise<PostEntity> {
    return await this.postsService.update(id, updatePostDto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return await this.postsService.remove(id);
  }
}
