import { BasestampError } from '../types';

describe('BasestampError', () => {
  test('should create error with custom message', () => {
    const message = 'Test error message';
    const error = new BasestampError(message);
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BasestampError);
    expect(error.message).toBe(message);
    expect(error.name).toBe('BasestampError');
  });

  test('should be throwable and catchable', () => {
    const message = 'Test error';
    
    expect(() => {
      throw new BasestampError(message);
    }).toThrow(BasestampError);
    
    expect(() => {
      throw new BasestampError(message);
    }).toThrow(message);
  });

  test('should inherit from Error properly', () => {
    const error = new BasestampError('test');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof BasestampError).toBe(true);
    expect(error.stack).toBeDefined();
  });
});