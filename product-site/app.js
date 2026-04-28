document.documentElement.classList.add("js-enhanced");

const navLinks = [...document.querySelectorAll(".site-nav a")];
const sections = [...document.querySelectorAll("main .section[id], main .hero[id]")];
const revealables = [...document.querySelectorAll(".reveal")];

function markActiveLink(id) {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("is-active", href === `#${id}`);
  });
}

if ("IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (visible?.target.id) {
        markActiveLink(visible.target.id);
      }
    },
    {
      rootMargin: "-25% 0px -55% 0px",
      threshold: [0.15, 0.35, 0.6],
    },
  );

  sections.forEach((section) => navObserver.observe(section));

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.15,
    },
  );

  revealables.forEach((node) => revealObserver.observe(node));
} else {
  revealables.forEach((node) => node.classList.add("is-visible"));
}
