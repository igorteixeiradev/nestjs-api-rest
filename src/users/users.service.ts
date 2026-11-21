import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { subject } from '@casl/ability';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserEntity } from './entities/user.entity.js';
import { CaslAbilityService } from '../casl/casl-ability/casl-ability.service.js';
import { Prisma } from '../generated/prisma/client.js';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private casl: CaslAbilityService,
  ) {}

  /** Used by both the public sign-up and the admin-only POST /users. */
  async create(createUserDto: CreateUserDto): Promise<UserEntity> {
    const userExists = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) throw new BadRequestException('User already exists');

    const hash = await bcrypt.hash(createUserDto.password, SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          name: createUserDto.name,
          email: createUserDto.email,
          password: hash,
        },
      });
      return new UserEntity({ ...user });
    } catch (e) {
      this.rethrowIfEmailTaken(e);
      throw e;
    }
  }

  async findAll(actor: UserEntity): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      where: this.casl.readableUsersWhere(actor),
    });
    // Must be UserEntity instances, otherwise @Exclude() is ignored
    // and the password hash is serialized.
    return users.map((user) => new UserEntity({ ...user }));
  }

  async findOne(id: string, actor: UserEntity): Promise<UserEntity> {
    const user = await this.findOrFail(id);
    this.casl.authorize(actor, 'read', subject('User', user));
    return new UserEntity({ ...user });
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    actor: UserEntity,
  ): Promise<UserEntity> {
    const user = await this.findOrFail(id);

    // Field-level check: e.g. a user can edit their own name/email/password,
    // but only an ADMIN can change `role`.
    const target = subject('User', user);
    for (const [field, value] of Object.entries(updateUserDto)) {
      if (value !== undefined) {
        this.casl.authorize(actor, 'update', target, field);
      }
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (emailTaken) throw new BadRequestException('User already exists');
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: updateUserDto.name,
          email: updateUserDto.email,
          role: updateUserDto.role,
          password: updateUserDto.password
            ? await bcrypt.hash(updateUserDto.password, SALT_ROUNDS)
            : undefined,
        },
      });
      return new UserEntity({ ...updatedUser });
    } catch (e) {
      this.rethrowIfEmailTaken(e);
      throw e;
    }
  }

  async remove(id: string, actor: UserEntity): Promise<void> {
    const user = await this.findOrFail(id);
    this.casl.authorize(actor, 'delete', subject('User', user));

    // Posts are removed together with the user (onDelete: Cascade).
    await this.prisma.user.delete({ where: { id: user.id } });
  }

  private async findOrFail(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return user;
  }

  /** Covers the race between the "email exists?" check and the write. */
  private rethrowIfEmailTaken(e: unknown): void {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      throw new BadRequestException('User already exists');
    }
  }
}
