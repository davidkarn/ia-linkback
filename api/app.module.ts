import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { CitationsController } from './citations.controller';
import { CitationsService } from './citations.service';
import { DatabaseModule } from './database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [BooksController, CitationsController],
  providers: [BooksService, CitationsService],
})
export class AppModule {}
