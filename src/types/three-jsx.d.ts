// @react-three/fiber v9 no longer augments the global JSX namespace; opt in once for the whole project.
import type { ThreeElements } from "@react-three/fiber";

declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ThreeElements {}
  }
}
