import handler from './profile';
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

// Mock global fetch
const originalFetch = global.fetch;

describe('/api/profile', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    process.env.PROFILE_API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.PROFILE_API_BASE_URL;
  });

  it('should return 405 for non-GET requests', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', { method: 'POST' });
    const response = await handler(req);
    
    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data.error).toBe('Method not allowed');
  });

  it('should return mock profile if PROFILE_API_BASE_URL is not set', async () => {
    delete process.env.PROFILE_API_BASE_URL;
    const req = new NextRequest('http://localhost:3000/api/profile?walletAddress=G123');
    
    const response = await handler(req);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.source).toBe('mock');
    expect(data.walletAddress).toBe('G123');
    expect(data).toMatchSnapshot();
  });

  it('should return mock profile if backend fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    
    const req = new NextRequest('http://localhost:3000/api/profile?walletAddress=G123');
    const response = await handler(req);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.source).toBe('mock');
    expect(data.walletAddress).toBe('G123');
  });

  it('should return mock profile if backend returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    
    const req = new NextRequest('http://localhost:3000/api/profile?walletAddress=G123');
    const response = await handler(req);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.source).toBe('mock');
    expect(data.walletAddress).toBe('G123');
  });

  it('should return normalized backend profile on successful fetch', async () => {
    const backendData = {
      walletAddress: 'G123',
      displayName: 'Backend User',
      bio: 'Bio from backend',
      reputation: {
        score: '85', // testing string parsing
        totalGigs: 10,
        completionRate: '95',
        averageRating: 4.5,
      },
      pastGigs: [
        {
          id: '1',
          title: 'Gig 1',
          client: 'Client A',
          completedAt: '2026-01-01T00:00:00Z',
          payoutUSDC: '500',
          rating: 5,
        }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => backendData,
    });
    
    const req = new NextRequest('http://localhost:3000/api/profile?walletAddress=G123');
    const response = await handler(req);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data.source).toBe('backend');
    expect(data.displayName).toBe('Backend User');
    expect(data.reputation.score).toBe(85); // should be parsed to number
    expect(data.reputation.totalGigs).toBe(10);
    expect(data.reputation.completionRate).toBe(95);
    expect(data.pastGigs[0].payoutUSDC).toBe(500);
  });
});
