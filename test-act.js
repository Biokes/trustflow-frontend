const { renderHook, act } = require('@testing-library/react');
const React = require('react');

jest.useFakeTimers();

function useTest() {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    Promise.resolve().then(() => setVal(1));
  }, []);
  return val;
}

test('test 1', async () => {
  const { result } = renderHook(() => useTest());
  await act(async () => {
    await Promise.resolve();
  });
});
