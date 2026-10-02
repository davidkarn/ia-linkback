import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { AuthorsService } from './authors.service';
import { id_param, paging_params, string_param } from './params';

@Controller('authors')
export class AuthorsController {
  constructor(@Inject(AuthorsService) private readonly authors: AuthorsService) {}

  @Get()
  async list(
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
    @Query('query') query?: unknown,
  ) {
    const { items, count } = await this.authors.list({
      ...paging_params(offset, length),
      query: string_param('query', query),
    });
    return { meta: { count }, items };
  }

  @Get(':authorId')
  async get(@Param('authorId') authorId: string) {
    const author = await this.authors.get(id_param('authorId', authorId));

    if (!author) {
      throw new NotFoundException(`No author with id ${ authorId }`);
    }
    else {
      return author;
    }
  }
}
