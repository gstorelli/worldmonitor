/**
 * Risk Sentinel — standalone application workspaces.
 *
 * OSINT, Research and Policy are NOT dashboard variants: they are separate
 * applications that share only the header/footer shell. A workspace owns its
 * entire `<main>` area, its data fetching and its styling.
 */

export interface AppWorkspace {
  /** Renders the application into the shell's main container. */
  mount(root: HTMLElement): Promise<void> | void;
  /** Optional teardown (timers, subscriptions) before navigation away. */
  unmount?(): void;
}

export type WorkspaceLoader = () => Promise<AppWorkspace>;
