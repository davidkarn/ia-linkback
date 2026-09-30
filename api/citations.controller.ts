import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { CitationsService } from './citations.service';
import { id_param, paging_params } from './params';

@Controller('books/:bookId')
export class CitationsController {
  constructor(@Inject(CitationsService) private readonly citations: CitationsService) {}

  @Get('citationsTo')
  async citationsTo(
    @Param('bookId') bookId: string,
    @Query('offset') offset?: unknown,
    @Query('length') length?: unknown,
  ) {
    const page   = paging_params(offset, length);
    const result = await this.citations.citationsTo(bookId, page);

    if (!result) {
      throw new NotFoundException(`No book with id ${ bookId }`);
    }
    else {
      return { meta: { count: result.count }, items: result.items };
    }
  }
}

@Controller('citations')
export class CitationSourcePagesController {
  constructor(@Inject(CitationsService) private readonly citations: CitationsService) {}

  @Get(':citationId/sourcePage')
  async sourcePage(@Param('citationId') citationId: string) {
    const result = await this.citations.sourcePage(id_param('citationId', citationId));

    if (!result) {
      throw new NotFoundException(`No citation with id ${ citationId }`);
    }
    else {
      return result;
    }
  }
}
