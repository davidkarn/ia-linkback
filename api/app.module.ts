import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AuthorsController } from './authors.controller';
import { AuthorsService } from './authors.service';
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
    AdminController, AuthorsController, BooksController, CitationsController, CitationSourcePagesController,
    InsightsController,
  ],
  providers:   [AdminGuard, AdminService, AuthorsService, BooksService, CitationsService, InsightsService],
})
export class AppModule {}
