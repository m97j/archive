import styles from "./project-art.module.css";

type ProjectArea = "Perception" | "Retrieval" | "Interaction" | "Action";
type Point = readonly [number, number];

const poses = [
  {
    limbs:
      "M48 34v31M32 50l16-8 17 9M32 50l-12 19-7-13M65 51l7 20 11-12M48 65l-9 22 17 1M39 87l-9 27-12 24M56 88l10 24 12 22",
    joints: [
      [48, 42],
      [32, 50],
      [20, 69],
      [13, 56],
      [65, 51],
      [72, 71],
      [83, 59],
      [48, 65],
      [39, 87],
      [56, 88],
      [30, 114],
      [18, 138],
      [66, 112],
      [78, 134],
    ],
  },
  {
    limbs:
      "M48 34v31M31 49l17-7 17 7M31 49l-10-15-8 12M65 49l12-16 8 13M48 65l-11 22h21M37 87l-10 27 11 24M58 87l14 26-5 24",
    joints: [
      [48, 42],
      [31, 49],
      [21, 34],
      [13, 46],
      [65, 49],
      [77, 33],
      [85, 46],
      [48, 65],
      [37, 87],
      [58, 87],
      [27, 114],
      [38, 138],
      [72, 113],
      [67, 137],
    ],
  },
  {
    limbs:
      "M48 34v31M30 50l18-8 18 8M30 50l-13 16-7-17M66 50l8 21 13-8M48 65l-10 22 19 1M38 87l-15 24 5 27M57 88l9 23 14 23",
    joints: [
      [48, 42],
      [30, 50],
      [17, 66],
      [10, 49],
      [66, 50],
      [74, 71],
      [87, 63],
      [48, 65],
      [38, 87],
      [57, 88],
      [23, 111],
      [28, 138],
      [66, 111],
      [80, 134],
    ],
  },
] as const;

function Perception() {
  return (
    <>
      <g className={styles.backgroundLines} fill="none" stroke="#c9bfb2" strokeWidth="0.6">
        <path d="M24 51h432M24 110h432M24 169h432M80 24v172M160 24v172M240 24v172M320 24v172M400 24v172" />
      </g>
      <path
        d="M92 135c23-82 90-94 119-42s97 77 167-19"
        fill="none"
        stroke="#bd9a94"
        strokeWidth="1"
        strokeDasharray="2 6"
        opacity=".45"
      />
      <g className={styles.composition}>
        {poses.map((pose, index) => (
          <g
            key={index}
            className={index === 1 ? styles.centerFrame : styles.sideFrame}
            transform={`translate(${80 + index * 112} 31)`}
          >
            <rect
              width="96"
              height="158"
              rx="15"
              fill="#fcfaf6"
              fillOpacity={index === 1 ? ".92" : ".63"}
              stroke="#d5cbc0"
              strokeWidth=".7"
            />
            <path d="M13 145h70" stroke="#ddd4c7" strokeWidth=".8" />
            <g
              transform="translate(0 6)"
              fill="none"
              stroke={index === 1 ? "#967573" : "#bda3a0"}
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="48" cy="24" r="8" fill="#e7d1cb" stroke="none" />
              <path d={pose.limbs} />
              {pose.joints.map(([x, y], joint) => (
                <circle
                  key={joint}
                  cx={x}
                  cy={y}
                  r={joint === 0 ? "2.4" : "2"}
                  fill={index === 1 ? "#ad8883" : "#c8a09c"}
                  stroke="#fcfaf6"
                  strokeWidth=".65"
                />
              ))}
            </g>
          </g>
        ))}
        <path
          d="M125 210c39-7 65-7 101-4s62 5 123-1"
          fill="none"
          stroke="#a5afa6"
          strokeWidth=".9"
          opacity=".8"
        />
        <circle cx="242" cy="207" r="2.2" fill="#9caca0" />
      </g>
    </>
  );
}

const cloud: Point[] = Array.from({ length: 47 }, (_, index) => {
  const angle = index * 2.39996;
  const radius = Math.sqrt((index + 1) / 47);
  return [
    Number((157 + Math.cos(angle) * radius * 92).toFixed(2)),
    Number((112 + Math.sin(angle) * radius * 71).toFixed(2)),
  ];
});

function Retrieval() {
  const selected = [7, 15, 21];
  return (
    <>
      <g fill="none" stroke="#b4bcc0" strokeWidth=".6" opacity=".14">
        <ellipse cx="157" cy="112" rx="115" ry="92" />
        <ellipse cx="157" cy="112" rx="88" ry="69" />
        <path d="M26 112h264M157 16v193" />
      </g>
      <g className={styles.composition}>
        <g fill="none" stroke="#86959d" strokeWidth=".6" opacity=".42">
          {cloud.slice(1, 28).map(([x, y], index) => (
            <path key={index} d={`M${x} ${y}L${cloud[(index + 8) % cloud.length]?.join(" ")}`} />
          ))}
        </g>
        {cloud.map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={index % 9 === 0 ? "2.2" : "1.55"}
            fill={selected.includes(index) ? "#ecc2b5" : "#aebbc0"}
            fillOpacity={selected.includes(index) ? "1" : ".63"}
          />
        ))}
        {selected.map((index, order) => {
          const [x, y] = cloud[index] ?? [157, 112];
          const cardY = 55 + order * 37;
          return (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r="7"
                fill="none"
                stroke="#c8a09c"
                strokeWidth=".9"
                opacity=".75"
              />
              <path
                d={`M${x + 7} ${y}C257 ${y} 259 ${cardY + 12} 297 ${cardY + 12}`}
                fill="none"
                stroke="#c8a09c"
                strokeWidth=".8"
                opacity=".68"
              />
              <rect
                x="297"
                y={cardY}
                width={105 - order * 13}
                height="25"
                rx="7"
                fill={order === 0 ? "#c8a09c" : "#626e76"}
                fillOpacity={order === 0 ? ".91" : ".52"}
                stroke={order === 0 ? "#ddbeb5" : "#9aa6ad"}
                strokeOpacity={order === 0 ? ".8" : ".3"}
                strokeWidth=".7"
              />
              <circle
                cx="309"
                cy={cardY + 12.5}
                r="2.3"
                fill={order === 0 ? "#fbebe0" : "#bec8ca"}
              />
              <path
                d={`M319 ${cardY + 12.5}h${62 - order * 10}`}
                stroke={order === 0 ? "#f2dfd3" : "#b0bdc1"}
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity=".66"
              />
            </g>
          );
        })}
        <path
          d="M296 179h43m8 0h17"
          stroke="#87979e"
          strokeWidth="1"
          strokeLinecap="round"
          opacity=".42"
        />
      </g>
    </>
  );
}

function Interaction() {
  return (
    <>
      <path
        d="M37 194c68-38 80-151 195-168s184 41 212 117"
        fill="none"
        stroke="#8b9a8c"
        strokeWidth=".7"
        opacity=".27"
      />
      <g className={styles.composition}>
        <path
          d="M142 54c33-16 98-9 119 21 22 31 20 76-9 102-24 22-83 31-118 3-42-34-40-99 8-126Z"
          fill="#a6b5a5"
          fillOpacity=".88"
        />
        <path
          d="M236 44c29-6 69 10 88 41 27 44 39 52 13 79-26 27-75 41-110 20-35-21-58-112 9-140Z"
          fill="#c8a09c"
          fillOpacity=".8"
        />
        <path
          d="M283 117c27-18 68-20 84-2 18 19 8 53-17 69-19 13-56 16-74-1-20-19-11-53 7-66Z"
          fill="#d5c098"
          fillOpacity=".7"
        />
        <path
          d="M141 71c-23 17-27 58-12 78M243 59c30-6 62 16 72 36M290 135c21-11 42-12 58-2"
          fill="none"
          stroke="#fffaf0"
          strokeWidth=".9"
          strokeLinecap="round"
          opacity=".48"
        />
        <path
          d="M102 117C130 58 197 151 245 104s63-44 120-19M149 180c22-55 80-51 147-27s73 1 104-19"
          fill="none"
          stroke="#5e716d"
          strokeWidth="1"
          opacity=".77"
        />
        <g fill="#f5f0e7" stroke="#89998b" strokeWidth="1">
          <circle cx="102" cy="117" r="5" />
          <circle cx="245" cy="104" r="5" />
          <circle cx="365" cy="85" r="5" />
          <circle cx="149" cy="180" r="4" />
          <circle cx="296" cy="153" r="4" />
          <circle cx="400" cy="134" r="4" />
        </g>
        <circle
          cx="245"
          cy="104"
          r="12"
          fill="none"
          stroke="#f8f0e6"
          strokeWidth=".7"
          opacity=".6"
        />
      </g>
    </>
  );
}

function Block({
  x,
  y,
  height,
  palette,
}: {
  x: number;
  y: number;
  height: number;
  palette: readonly [string, string, string];
}) {
  return (
    <g stroke="#f6ead8" strokeWidth=".65" strokeLinejoin="round">
      <path d={`M${x} ${y - height}l26-14 26 14-26 14Z`} fill={palette[0]} />
      <path d={`M${x} ${y - height}l26 14v${height}l-26-14Z`} fill={palette[1]} />
      <path d={`M${x + 26} ${y - height + 14}l26-14v${height}l-26 14Z`} fill={palette[2]} />
    </g>
  );
}

function Action() {
  return (
    <>
      <g fill="none" stroke="#a89982" strokeWidth=".65" opacity=".2">
        {Array.from({ length: 8 }, (_, index) => (
          <g key={index}>
            <path d={`M${77 + index * 31} ${109 - index * 17}l248 136`} />
            <path d={`M${77 + index * 31} ${109 + index * 17}l248-136`} />
          </g>
        ))}
      </g>
      <g className={styles.composition}>
        <ellipse cx="249" cy="169" rx="134" ry="24" fill="#ad9b84" opacity=".1" />
        <path
          d="m131 127 52-28 52 28 52 28 78-42"
          fill="none"
          stroke="#a7887b"
          strokeWidth="9"
          strokeLinejoin="round"
          opacity=".28"
        />
        <path
          d="m131 127 52-28 52 28 52 28 78-42"
          fill="none"
          stroke="#fbf1e1"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <Block x={111} y={125} height={20} palette={["#b8c2b5", "#93a38f", "#a2b09d"]} />
        <Block x={164} y={96} height={41} palette={["#e3c2b7", "#b89991", "#c8a09c"]} />
        <Block x={217} y={127} height={16} palette={["#b6bbc2", "#929aa6", "#a2aab5"]} />
        <Block x={271} y={156} height={32} palette={["#ddc59c", "#bea77f", "#cbb38b"]} />
        <Block x={325} y={126} height={51} palette={["#c3cabb", "#98a38e", "#adb6a1"]} />
        <path
          d="m152 82 33-18 52 28 52 28 35-19"
          fill="none"
          stroke="#a6847b"
          strokeWidth=".85"
          strokeDasharray="2 5"
          opacity=".55"
        />
        <g fill="#f9eddb" stroke="#ac9281" strokeWidth=".75">
          <circle cx="151" cy="82" r="3" />
          <circle cx="324" cy="101" r="3" />
        </g>
      </g>
    </>
  );
}

const illustrations = { Perception, Retrieval, Interaction, Action };
const surfaces = {
  Perception: styles.perception,
  Retrieval: styles.retrieval,
  Interaction: styles.interaction,
  Action: styles.action,
};

export function ProjectArt({ area }: { area: ProjectArea }) {
  const Illustration = illustrations[area];
  return (
    <div className={`${styles.art} ${surfaces[area]}`} aria-hidden="true">
      <svg viewBox="0 0 480 220" fill="none" focusable="false" aria-hidden="true">
        <Illustration />
      </svg>
    </div>
  );
}
