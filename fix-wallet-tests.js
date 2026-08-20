const fs = require('fs');

let content = fs.readFileSync('hooks/useWallet.test.ts', 'utf8');

// Replace all instances of `const { result } = renderHook(() => useWallet());`
// with the same line followed by `await act(async () => { await Promise.resolve(); });`
content = content.replace(
  /const { result } = renderHook\(\(\) => useWallet\(\)\);/g,
  `const { result } = renderHook(() => useWallet());\n    await act(async () => { await Promise.resolve(); });`
);

fs.writeFileSync('hooks/useWallet.test.ts', content);
