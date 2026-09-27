import {
  BadGatewayException, Controller, Get, Inject, NotFoundException, Param, Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InsightsService, OpenRouterFailed, OpenRouterUnavailable } from './insights.service';
import { int_param } from './params';

@Controller('books/:bookId/pages/:pageId')
export class InsightsController {
  constructor(@Inject(InsightsService) private readonly insights: InsightsService) {}

  // What other books in the collection say about this page. 204 (no body) when nothing cites it.
  @Get('insights')
  async pageInsights(
    @Param('bookId') bookId: string,
    @Param('pageId') pageId: string,
    @Res({ passthrough: true }) res: { status: (code: number) => unknown },
  ) {
    const pageNumber = int_param('pageId', pageId, 1, 1, 1000000);

    try {
      const result = await this.insights.pageInsights(bookId, pageNumber);

      if (result === 'no page') {
        throw new NotFoundException(`No page ${ pageId } in book ${ bookId }`);
      }
      else if (result === 'no citations') {
        res.status(204);
        return undefined;
      }
      else {
        return result;
      }
    }
    catch (e) {
      if (e instanceof OpenRouterUnavailable) {
        throw new ServiceUnavailableException(`Insights are unavailable: ${ e.message }`);
      }
      else if (e instanceof OpenRouterFailed) {
        throw new BadGatewayException(`The insights request failed: ${ e.message }`);
      }
      else {
        throw e;
      }
    }
  }
}
