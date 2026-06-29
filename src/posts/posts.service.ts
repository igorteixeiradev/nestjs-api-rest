import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { PostEntity } from './entities/post.entity.js';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}
  async create(
    createPostDto: CreatePostDto & { authorId: string },
  ): Promise<PostEntity> {
    const post = await this.prisma.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        published: createPostDto.published,
        authorId: createPostDto.authorId,
      },
      include: {
        author: true,
      },
    });
    const userEntity = new UserEntity({ ...post.author });
    return new PostEntity({ ...post, author: userEntity });
  }

  async findAll(page: number = 1, limit: number = 10) {
    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        include: {
          author: true,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc', // Posts mais recentes primeiro
        },
      }),
      this.prisma.post.count(),
    ]);

    // Mapear para entidades
    const data = posts.map(
      (post) =>
        new PostEntity({
          ...post,
          author: new UserEntity(post.author),
        }),
    );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
      },
    });
    if (!post) throw new NotFoundException(`Post with id ${id} not found`);
    const userEntity = new UserEntity({ ...post.author });
    return new PostEntity({ ...post, author: userEntity });
  }

  async update(id: string, updatePostDto: UpdatePostDto) {
    const post = await this.findOne(id);
    await this.prisma.post.update({
      where: { id },
      data: updatePostDto,
    });

    const userEntity = new UserEntity({ ...post.author });
    return new PostEntity({ ...post, author: userEntity });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.post.delete({
      where: { id },
    });
  }
}
