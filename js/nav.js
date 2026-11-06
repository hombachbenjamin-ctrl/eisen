const stack = [];

/** Records a route change and reports whether the user went forward, back or nowhere. */
export function track(path) {
  if (stack.at(-1) === path) return 'same';
  if (stack.at(-2) === path) {
    stack.pop();
    return 'back';
  }
  stack.push(path);
  return 'forward';
}

// Back returns to where the user came from, e.g. from an exercise's history into the running workout.
export function goBack(fallback) {
  if (stack.length > 1) history.back();
  else location.hash = fallback;
}

export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
