/**
 * The app's top-level shell: a native tab bar holding Home and Account (installed by the tabs module, which replaced
 * the stack shell). Add a tab: a route file in `src/app/(app)/(tabs)/` and a trigger in its `_layout.tsx`.
 */
export const shell: { tabs: boolean; anchor: string } = { tabs: true, anchor: '(tabs)' };
