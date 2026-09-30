import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { CitationSourcePagesController, CitationsController } from './citations.controller';
import { CitationsService } from './citations.service';
import { DatabaseModule } from './database.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports:     [DatabaseModule],
  controllers: [
    BooksController, CitationsController, CitationSourcePagesController, InsightsController,
  ],
  providers:   [BooksService, CitationsService, InsightsService],
})
export class AppModule {}
