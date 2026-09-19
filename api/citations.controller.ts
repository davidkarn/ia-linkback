import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { CitationsService } from './citations.service';
import { paging_params } from './params';

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
      throw new NotFoundException(`No book with id ${bookId}`);
    }
    else {
      return { meta: { count: result.count }, items: result.items };
    }
  }
}
