import handler from './usdc-price';
import { NextRequest } from 'next/server';

jest.mock('next/server', () => {
  return {
    NextRequest: jest.fn().mockImplementation((url, init) => {
      return { url, method: init?.method || 'GET' };
    }),
    NextResponse: {
      json: jest.fn().mockImplementation((body, init) => {
        return {
          status: init?.status || 200,
          json: async () => body,
        };
      }),
    },
  };
});

describe('/api/usdc-price', () => {
  it('should return 405 for non-GET requests', async () => {
    const req = new NextRequest('http://localhost:3000/api/usdc-price', { method: 'POST' });
    const response = await handler(req);
    
    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data.error).toBe('Method not allowed');
  });

  it('should return mock USDC price on GET request', async () => {
    const req = new NextRequest('http://localhost:3000/api/usdc-price');
    const response = await handler(req);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data.currency).toBe('USD');
    expect(data.source).toBe('mock');
    expect(typeof data.price).toBe('number');
    expect(data.price).toBeGreaterThanOrEqual(0.99);
    expect(data.price).toBeLessThanOrEqual(1.01);
    expect(typeof data.timestamp).toBe('number');
    expect(data).toMatchSnapshot({
      timestamp: expect.any(Number),
      price: expect.any(Number)
    });
  });
});
