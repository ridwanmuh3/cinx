import { IsIn, IsOptional } from 'class-validator';
import { MockSimulation } from '@ticketing/shared';

export class PayBookingDto {
  @IsIn(['MOCK'])
  paymentMethod: 'MOCK';

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE'])
  simulate?: MockSimulation;
}
