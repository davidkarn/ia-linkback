import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { BooksService } from './books.service';
import { paging_params, string_param } from './params';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly books: BooksService) {}

  @Get()
  async list(
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
    @Query('query') query?: unknown,
  ) {
    const { items, count } = await this.books.search({
      ...paging_params(offset, length),
      query: string_param('query', query),
    });
    
    return { meta: { count }, items };
  }

  @Get(':bookId')
  async get(@Param('bookId') bookId: string) {
    const book = await this.books.get(bookId);

    if (!book) {
      throw new NotFoundException(`No book with id ${bookId}`);
    }
    else {
      return book;
    }
  }
}
