import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { BooksService } from './books.service';
import { id_param, int_param, optional_int_param, paging_params, string_param } from './params';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly books: BooksService) {}

  @Get()
  async list(
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
    @Query('query') query?: unknown,
    @Query('authorId') authorId?: unknown,
  ) {
    const author           = string_param('authorId', authorId);
    const { items, count } = await this.books.search({
      ...paging_params(offset, length),
      query:    string_param('query', query),
      authorId: author === undefined ? undefined : id_param('authorId', author),
    });

    return { meta: { count }, items };
  }

  @Get(':bookId')
  async get(
    @Param('bookId') bookId: string,
    @Query('volume') volume?: unknown,
    @Query('pageId') pageId?: unknown,
  ) {
    const book = await this.books.get(bookId, {
      volume: optional_int_param('volume', volume, 1, 100000),
      pageId: optional_int_param('pageId', pageId, 1, 1000000),
    });

    if (!book) {
      throw new NotFoundException(`No book with id ${ bookId }, or no such volume`);
    }
    else {
      return book;
    }
  }

  @Get(':bookId/pages/:pageId')
  async getPage(@Param('bookId') bookId: string, @Param('pageId') pageId: string) {
    const pageNumber = int_param('pageId', pageId, 1, 1, 1000000);
    const page       = await this.books.getPage(bookId, pageNumber);

    if (!page) {
      throw new NotFoundException(`No page ${ pageId } in book ${ bookId }`);
    }
    else {
      return page;
    }
  }
}
