/* eslint-disable @next/next/no-img-element -- PNG pequeno e estático; next/image não acrescenta nada aqui */

/** Logo oficial da Stage (marca/assets/logo/Logotipo_Stage.png, copiado para public/). */
export function Logo({ height = 24 }: { height?: number }) {
  return <img src="/logo-stage.png" alt="Stage" height={height} width={Math.round(height * (3177 / 820))} style={{ height, width: "auto" }} />;
}
