export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  return {
    get: () => state,
    set(nextState) {
      const value = typeof nextState === "function" ? nextState(state) : nextState;
      if (Object.is(value, state)) {
        return state;
      }
      state = value;
      for (const subscriber of subscribers) {
        subscriber(state);
      }
      return state;
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
}
