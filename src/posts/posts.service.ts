import { Injectable, NotFoundException } from '@nestjs/common';
import { subject } from '@casl/ability';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { PostEntity } from './entities/post.entity.js';
import { CaslAbilityService } from '../casl/casl-ability/casl-ability.service.js';
import type { Post, User } from '../generated/prisma/client.js';

type PostWithAuthor = Post & { author: User };

@Injectable()
export class PostsService {
  constructor(
    private prisma: PrismaService,
    private casl: CaslAbilityService,
  ) {}

  async create(
    createPostDto: CreatePostDto,
    actor: UserEntity,
  ): Promise<PostEntity> {
    this.casl.authorize(actor, 'create', 'Post');

    const post = await this.prisma.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        published: createPostDto.published,
        authorId: actor.id,
      },
      include: { author: true },
    });
    return this.toEntity(post);
  }

  async findAll(page: number, limit: number, actor: UserEntity) {
    // Only posts the actor is allowed to read (e.g. READER sees published only).
    const where = this.casl.readablePostsWhere(actor);
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { author: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }, // most recent first
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts.map((post) => this.toEntity(post)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, actor: UserEntity): Promise<PostEntity> {
    return this.toEntity(await this.findReadableOrFail(id, actor));
  }

  async update(
    id: string,
    updatePostDto: UpdatePostDto,
    actor: UserEntity,
  ): Promise<PostEntity> {
    const post = await this.findReadableOrFail(id, actor);
    this.casl.authorize(actor, 'update', subject('Post', post));

    // Explicit whitelist of columns: never pass the DTO straight to Prisma.
    const updated = await this.prisma.post.update({
      where: { id: post.id },
      data: {
        title: updatePostDto.title,
        content: updatePostDto.content,
        published: updatePostDto.published,
      },
      include: { author: true },
    });
    return this.toEntity(updated);
  }

  async remove(id: string, actor: UserEntity): Promise<void> {
    const post = await this.findReadableOrFail(id, actor);
    this.casl.authorize(actor, 'delete', subject('Post', post));

    await this.prisma.post.delete({ where: { id: post.id } });
  }

  /**
   * Looks the post up restricted to what the actor may read, so unpublished
   * posts of other people return 404 instead of leaking their existence.
   */
  private async findReadableOrFail(
    id: string,
    actor: UserEntity,
  ): Promise<PostWithAuthor> {
    const readable = this.casl.readablePostsWhere(actor);

    const post = await this.prisma.post.findFirst({
      where: { AND: [readable, { id }] },
      include: { author: true },
    });
    if (!post) throw new NotFoundException(`Post with id ${id} not found`);
    return post;
  }

  private toEntity(post: PostWithAuthor): PostEntity {
    return new PostEntity({
      ...post,
      author: new UserEntity({ ...post.author }),
    });
  }
}
