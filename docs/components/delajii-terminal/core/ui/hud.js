export function createHud() {
  const location = document.querySelector(".location");
  const heading = document.querySelector("#heading");
  const arrow = document.querySelector("#compass-arrow");
  const cardinals = ["N", "E", "S", "W"];

  return {
    update(position, yaw) {
      const angle = Math.atan2(-Math.sin(yaw), Math.cos(yaw));
      const index = ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4;
      heading.textContent = cardinals[index];
      arrow.style.transform = `rotate(${angle}rad)`;
      location.textContent = `Location X ${position.x.toFixed(1)} / Z ${position.z.toFixed(1)}`;
    }
  };
}
