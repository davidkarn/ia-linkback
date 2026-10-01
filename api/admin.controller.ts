// The admin panel's endpoints (the frontend's /tl-admin): signing in and out, and the dashboard,
// which only a signed-in admin can read (see AdminGuard and core/admin_auth.ts)
import {
  Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res, ServiceUnavailableException,
  UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { CITATION_MATCHES } from '../model/citations';
import { BOOK_SORTS } from '../model/books';
import { QUEUE_STATUSES } from '../core/queued_books';
import { QUEUED_BOOK_SORTS } from '../model/queued_book_imports';
import { enum_param, int_param, string_param } from './params';
import {
  adminCredentials, isAdmin, SESSION_MS, sessionCookieHeader, sessionToken,
} from '../core/admin_auth';
import { AdminGuard, isAdminRequest, type AdminRequest } from './admin.guard';
import { AdminService } from './admin.service';

type CookieResponse = { setHeader: (name: string, value: string) => unknown };

@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  // Whether this browser is signed in
  @Get('session')
  session(@Req() req: AdminRequest) {
    return { signedIn: isAdminRequest(req) };
  }

  // Sign in with ADMIN_USERNAME and ADMIN_PASSWORD: sets the session cookie. 401 for anything else.
  @Post('login')
  @HttpCode(200)
  login(
    @Body() body: { username?: unknown, password?: unknown } | undefined,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const admin = adminCredentials(process.env);
    const now   = Date.now();

    if (!admin) {
      throw new ServiceUnavailableException('The admin panel is closed: ADMIN_USERNAME and ADMIN_PASSWORD are not set');
    }
    else if (!isAdmin({ username: body?.username, password: body?.password }, admin)) {
      throw new UnauthorizedException('Wrong username or password');
    }
    else {
      const expiresAt = now + SESSION_MS;
      res.setHeader('Set-Cookie', sessionCookieHeader(sessionToken(expiresAt, admin), expiresAt, now, req.secure));
      return { signedIn: true };
    }
  }

  // Sign out: ends the session cookie
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: AdminRequest, @Res({ passthrough: true }) res: CookieResponse) {
    res.setHeader('Set-Cookie', sessionCookieHeader(null, 0, Date.now(), req.secure));
    return { signedIn: false };
  }

  // The queue's status counts and the books next up
  @Get('dashboard')
  @UseGuards(AdminGuard)
  dashboard() {
    return this.admin.dashboard();
  }

  // A page of the citations, searched by title, author and raw text and filtered by whether
  // they're matched to the book they cite, by author then title
  @Get('citations')
  @UseGuards(AdminGuard)
  async citations(
    @Query('query') query?: unknown,
    @Query('sourceBookId') sourceBookId?: unknown,
    @Query('matched') matched?: unknown,
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
  ) {
    const book             = string_param('sourceBookId', sourceBookId);
    const { items, count } = await this.admin.citations({
      sourceBookId: book === undefined || book.length === 0 ? undefined : book,
      // further than the other paged endpoints: there are hundreds of thousands of citations
      offset:       int_param('offset', offset, 0, 0, 10000000),
      length:       int_param('length', length, 50, 1, 200),
      query:        string_param('query', query) ?? '',
      match:        enum_param('matched', matched, CITATION_MATCHES, 'all'),
    });

    return { meta: { count }, items };
  }

  // A page of the books with their citation counts, searched by title and author, sorted by
  // title or by citations from them
  @Get('books')
  @UseGuards(AdminGuard)
  async books(
    @Query('query') query?: unknown,
    @Query('sort') sort?: unknown,
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
  ) {
    const { items, count } = await this.admin.books({
      query:  string_param('query', query) ?? '',
      sort:   enum_param('sort', sort, BOOK_SORTS, 'title'),
      offset: int_param('offset', offset, 0, 0, 100000),
      length: int_param('length', length, 50, 1, 200),
    });

    return { meta: { count }, items };
  }

  // A page of the queued books, by status or by when they were created or updated, searched by
  // title and author and filtered by status
  @Get('queued-books')
  @UseGuards(AdminGuard)
  async queuedBooks(
    @Query('query') query?: unknown,
    @Query('status') status?: unknown,
    @Query('sort') sort?: unknown,
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
  ) {
    const only             = enum_param('status', status, [...QUEUE_STATUSES, 'all'], 'all');
    const { items, count } = await this.admin.queuedBooks({
      query:  string_param('query', query) ?? '',
      status: only === 'all' ? undefined : only,
      sort:   enum_param('sort', sort, QUEUED_BOOK_SORTS, 'status'),
      offset: int_param('offset', offset, 0, 0, 100000),
      length: int_param('length', length, 50, 1, 200),
    });

    return { meta: { count }, items };
  }

  // The footnote extraction insights with their scores
  @Get('citation-insights')
  @UseGuards(AdminGuard)
  citationInsights() {
    return this.admin.citationInsights();
  }
}
