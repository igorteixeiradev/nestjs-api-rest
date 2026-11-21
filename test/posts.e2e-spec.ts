import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  createUser,
  resetDatabase,
  TestUser,
  UNKNOWN_ID,
} from './helpers.js';

describe('Posts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;
  let editor: TestUser;
  let writer1: TestUser;
  let writer2: TestUser;
  let reader: TestUser;

  const http = () => request(app.getHttpServer());

  const seedPost = (authorId: string, title: string, published: boolean) =>
    prisma.post.create({
      data: { title, content: 'content', published, authorId },
    });

  const titles = (res: request.Response): string[] =>
    (res.body.data as { title: string }[]).map((post) => post.title).sort();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await createUser(app, prisma, 'admin', 'ADMIN');
    editor = await createUser(app, prisma, 'editor', 'EDITOR');
    writer1 = await createUser(app, prisma, 'writer1', 'WRITER');
    writer2 = await createUser(app, prisma, 'writer2', 'WRITER');
    reader = await createUser(app, prisma, 'reader', 'READER');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /posts', () => {
    const payload = { title: 'Hello', content: 'World', published: true };

    it.each(['admin', 'editor', 'writer1'] as const)(
      '%s can create',
      async (who) => {
        const actor = { admin, editor, writer1 }[who];
        const res = await http()
          .post('/posts')
          .set('Authorization', bearer(actor))
          .send(payload)
          .expect(201);

        expect(res.body.title).toBe('Hello');
        expect(res.body.author.id).toBe(actor.id);
        expect(res.body.author).not.toHaveProperty('password');
        expect(res.body).not.toHaveProperty('authorId');
      },
    );

    it('READER cannot create', async () => {
      await http()
        .post('/posts')
        .set('Authorization', bearer(reader))
        .send(payload)
        .expect(403);

      expect(await prisma.post.count()).toBe(0);
    });

    it('the author is always the logged user, never the body', async () => {
      await http()
        .post('/posts')
        .set('Authorization', bearer(writer1))
        .send({ ...payload, authorId: writer2.id })
        .expect(400);
    });

    it('validates the body', async () => {
      await http()
        .post('/posts')
        .set('Authorization', bearer(writer1))
        .send({ title: 'no content' })
        .expect(400);
    });
  });

  describe('GET /posts (visibility)', () => {
    beforeEach(async () => {
      await seedPost(writer1.id, 'w1-draft', false);
      await seedPost(writer1.id, 'w1-public', true);
      await seedPost(writer2.id, 'w2-draft', false);
      await seedPost(editor.id, 'editor-public', true);
    });

    it('READER only sees published posts', async () => {
      const res = await http()
        .get('/posts')
        .set('Authorization', bearer(reader))
        .expect(200);

      expect(titles(res)).toEqual(['editor-public', 'w1-public']);
      expect(res.body.meta.total).toBe(2);
    });

    it('WRITER sees published posts plus their own drafts', async () => {
      const res = await http()
        .get('/posts')
        .set('Authorization', bearer(writer1))
        .expect(200);

      expect(titles(res)).toEqual(['editor-public', 'w1-draft', 'w1-public']);
      expect(res.body.meta.total).toBe(3);
    });

    it.each(['admin', 'editor'] as const)('%s sees everything', async (who) => {
      const actor = { admin, editor }[who];
      const res = await http()
        .get('/posts')
        .set('Authorization', bearer(actor))
        .expect(200);

      expect(res.body.meta.total).toBe(4);
    });
  });

  describe('GET /posts/:id', () => {
    it("hides other people's drafts with 404 (does not leak existence)", async () => {
      const draft = await seedPost(writer1.id, 'secret', false);

      await http()
        .get(`/posts/${draft.id}`)
        .set('Authorization', bearer(reader))
        .expect(404);
      await http()
        .get(`/posts/${draft.id}`)
        .set('Authorization', bearer(writer2))
        .expect(404);
    });

    it('the author, editors and admins can read a draft', async () => {
      const draft = await seedPost(writer1.id, 'secret', false);

      for (const actor of [writer1, editor, admin]) {
        await http()
          .get(`/posts/${draft.id}`)
          .set('Authorization', bearer(actor))
          .expect(200);
      }
    });

    it('everyone can read a published post', async () => {
      const post = await seedPost(writer1.id, 'public', true);

      await http()
        .get(`/posts/${post.id}`)
        .set('Authorization', bearer(reader))
        .expect(200);
    });

    it('returns 404 for an unknown id', async () => {
      await http()
        .get(`/posts/${UNKNOWN_ID}`)
        .set('Authorization', bearer(admin))
        .expect(404);
    });
  });

  describe('PATCH /posts/:id', () => {
    it('the owner updates and receives the UPDATED data', async () => {
      const post = await seedPost(writer1.id, 'old title', false);

      const res = await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(writer1))
        .send({ title: 'new title', published: true })
        .expect(200);

      expect(res.body).toMatchObject({ title: 'new title', published: true });

      const stored = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(stored).toMatchObject({ title: 'new title', published: true });
    });

    it('supports partial updates', async () => {
      const post = await seedPost(writer1.id, 'title', true);

      await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(writer1))
        .send({ content: 'only content changed' })
        .expect(200);

      const stored = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(stored).toMatchObject({
        title: 'title',
        content: 'only content changed',
      });
    });

    it("EDITOR and ADMIN can update anyone's post", async () => {
      const post = await seedPost(writer1.id, 'title', true);

      await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(editor))
        .send({ title: 'by editor' })
        .expect(200);
      await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(admin))
        .send({ title: 'by admin' })
        .expect(200);
    });

    it('another WRITER cannot update (403 on a published post)', async () => {
      const post = await seedPost(writer1.id, 'title', true);

      await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(writer2))
        .send({ title: 'hijacked' })
        .expect(403);

      const stored = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(stored.title).toBe('title');
    });

    it('READER cannot update', async () => {
      const post = await seedPost(writer1.id, 'title', true);

      await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(reader))
        .send({ title: 'hijacked' })
        .expect(403);
    });

    it('cannot reassign the post to another author (mass assignment)', async () => {
      const post = await seedPost(writer1.id, 'title', true);

      await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', bearer(writer1))
        .send({ authorId: writer2.id })
        .expect(400);

      const stored = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(stored.authorId).toBe(writer1.id);
    });
  });

  describe('DELETE /posts/:id', () => {
    it('the owner (WRITER) can delete', async () => {
      const post = await seedPost(writer1.id, 'mine', true);

      await http()
        .delete(`/posts/${post.id}`)
        .set('Authorization', bearer(writer1))
        .expect(204);
      expect(await prisma.post.count()).toBe(0);
    });

    it('ADMIN can delete any post', async () => {
      const post = await seedPost(writer1.id, 'any', true);

      await http()
        .delete(`/posts/${post.id}`)
        .set('Authorization', bearer(admin))
        .expect(204);
    });

    it.each(['writer2', 'reader', 'editor'] as const)(
      "%s cannot delete someone else's post",
      async (who) => {
        const actor = { writer2, reader, editor }[who];
        const post = await seedPost(writer1.id, 'protected', true);

        await http()
          .delete(`/posts/${post.id}`)
          .set('Authorization', bearer(actor))
          .expect(403);
        expect(await prisma.post.count()).toBe(1);
      },
    );

    it('returns 404 for an unknown id', async () => {
      await http()
        .delete(`/posts/${UNKNOWN_ID}`)
        .set('Authorization', bearer(admin))
        .expect(404);
    });
  });

  describe('GET /posts (pagination)', () => {
    beforeEach(async () => {
      await prisma.post.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          title: `post-${String(i).padStart(2, '0')}`,
          content: 'c',
          published: true,
          authorId: writer1.id,
          // distinct timestamps => deterministic "newest first" ordering
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        })),
      });
    });

    it('defaults to page 1 with 10 items, newest first', async () => {
      const res = await http()
        .get('/posts')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(res.body.data).toHaveLength(10);
      expect(res.body.data[0].title).toBe('post-24');
      expect(res.body.meta).toEqual({
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      });
    });

    it('honours page and limit', async () => {
      const res = await http()
        .get('/posts?page=3&limit=10')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toMatchObject({
        page: 3,
        limit: 10,
        totalPages: 3,
      });
    });

    it('returns an empty page past the end', async () => {
      const res = await http()
        .get('/posts?page=99')
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it.each([
      'page=abc',
      'page=0',
      'page=-1',
      'limit=0',
      'limit=101',
      'limit=1.5',
      'foo=bar',
    ])('?%s answers 400 (not 500)', async (query) => {
      await http()
        .get(`/posts?${query}`)
        .set('Authorization', bearer(admin))
        .expect(400);
    });
  });
});
