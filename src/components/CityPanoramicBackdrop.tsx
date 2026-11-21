import React from 'react';

interface CityPanoramicBackdropProps {
  cityId: string;
  skylineColor?: string;
  isDark?: boolean;
  className?: string;
}

export const CityPanoramicBackdrop: React.FC<CityPanoramicBackdropProps> = ({
  cityId,
  skylineColor,
  isDark = false,
  className = 'w-full h-full',
}) => {
  const normalizedId = (cityId || '').toLowerCase();
  const fill = skylineColor || (isDark ? '#F27A55' : '#C4512C');

  // Common floating atmospheric clouds (upper horizon)
  const clouds = (
    <g className="transition-opacity duration-700" style={{ color: fill }}>
      {/* Cloud 1 (Left) */}
      <path
        d="M60 48 C60 36 72 26 88 26 C94 26 100 28 104 32 C110 22 124 16 138 16 C158 16 174 30 176 48 C188 50 198 60 198 72 C198 84 186 94 172 94 L70 94 C54 94 42 82 42 68 C42 56 50 48 60 48 Z"
        fill="currentColor"
        opacity={isDark ? '0.14' : '0.18'}
      />
      {/* Cloud 2 (Center-Right) */}
      <path
        d="M680 38 C680 28 690 20 704 20 C710 20 715 22 719 25 C725 18 736 14 748 14 C765 14 779 26 781 40 C791 42 800 50 800 60 C800 70 790 78 778 78 L690 78 C676 78 665 68 665 56 C665 46 672 38 680 38 Z"
        fill="currentColor"
        opacity={isDark ? '0.12' : '0.15'}
      />
      {/* Cloud 3 (Far Right) */}
      <path
        d="M980 52 C980 40 994 30 1012 30 C1019 30 1026 33 1031 38 C1038 27 1054 20 1070 20 C1094 20 1113 36 1115 56 C1129 58 1140 70 1140 84 C1140 98 1126 110 1110 110 L992 110 C973 110 958 96 958 80 C958 66 967 56 980 52 Z"
        fill="currentColor"
        opacity={isDark ? '0.16' : '0.2'}
      />
      {/* Cloud 4 (Subtle low haze cloud in background) */}
      <path
        d="M340 70 C340 58 354 48 372 48 C378 48 384 50 389 54 C396 44 410 38 424 38 C446 38 463 52 465 70 C477 72 486 82 486 94 C486 106 474 116 460 116 L350 116 C334 116 322 104 322 90 C322 78 330 70 340 70 Z"
        fill="currentColor"
        opacity={isDark ? '0.08' : '0.12'}
      />
    </g>
  );

  // 1. Delhi NCR: Lotus Temple + Qutub Minar + India Gate + Rashtrapati Bhavan / Parliament + Red Fort
  if (normalizedId.includes('delhi')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Delhi NCR architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background layer */}
        <g style={{ color: fill }} opacity={isDark ? '0.28' : '0.32'}>
          {/* Distant Parliament dome & colonnade */}
          <path
            d="M520 240 L520 160 L540 160 L540 148 C540 120 660 120 660 148 L660 160 L680 160 L680 240 Z"
            fill="currentColor"
          />
          {/* Distant Red Fort rampart walls */}
          <path
            d="M860 240 L860 168 L880 168 L880 152 L910 152 L910 168 L960 168 L960 148 L990 148 L990 168 L1040 168 L1040 140 L1070 140 L1070 168 L1100 168 L1100 240 Z"
            fill="currentColor"
          />
          {/* Distant low city blocks */}
          <rect x="0" y="195" width="220" height="45" fill="currentColor" />
          <rect x="740" y="185" width="130" height="55" fill="currentColor" />
        </g>

        {/* Foreground prominent landmark silhouettes */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          {/* Base ground plane */}
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. LOTUS TEMPLE (Far Left, x=30 to x=190) */}
          {/* Central inner petal dome */}
          <path
            d="M110 92 C105 130 92 180 62 236 L158 236 C128 180 115 130 110 92 Z"
            fill="currentColor"
          />
          {/* Left curved petal wing */}
          <path
            d="M102 124 C82 148 54 186 32 236 L78 236 C94 195 102 160 106 130 Z"
            fill="currentColor"
          />
          {/* Right curved petal wing */}
          <path
            d="M118 124 C138 148 166 186 188 236 L142 236 C126 195 118 160 114 130 Z"
            fill="currentColor"
          />
          {/* Pod base plinth */}
          <path d="M22 236 L198 236 L186 226 L34 226 Z" fill="currentColor" />

          {/* 2. QUTUB MINAR (Left-Center, x=220 to x=280) */}
          {/* Multi-tier tapering fluted minaret */}
          <polygon points="234,236 244,72 258,72 268,236" fill="currentColor" />
          {/* Balcony 1 */}
          <rect x="232" y="192" width="38" height="6" rx="1" fill="currentColor" />
          {/* Balcony 2 */}
          <rect x="236" y="152" width="30" height="5" rx="1" fill="currentColor" />
          {/* Balcony 3 */}
          <rect x="240" y="118" width="22" height="5" rx="1" fill="currentColor" />
          {/* Balcony 4 */}
          <rect x="244" y="88" width="14" height="4" rx="1" fill="currentColor" />
          {/* Top cupola & spire */}
          <path d="M246 72 C246 56 256 56 256 72 Z" fill="currentColor" />
          <line x1="251" y1="56" x2="251" y2="42" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. INDIA GATE (Center-Left, x=340 to x=490) */}
          {/* Stepped base */}
          <rect x="340" y="230" width="150" height="6" fill="currentColor" />
          <rect x="348" y="224" width="134" height="6" fill="currentColor" />
          <rect x="356" y="218" width="118" height="6" fill="currentColor" />
          {/* Left Pylon */}
          <rect x="362" y="118" width="34" height="100" fill="currentColor" />
          {/* Right Pylon */}
          <rect x="434" y="118" width="34" height="100" fill="currentColor" />
          {/* Grand Arch Opening */}
          <path
            d="M396 218 L396 156 C396 130 434 130 434 156 L434 218 Z"
            fill="currentColor"
          />
          {/* Main Cornice Lintel */}
          <rect x="352" y="112" width="126" height="8" rx="1" fill="currentColor" />
          {/* Inscription Attic Block */}
          <rect x="360" y="88" width="110" height="24" fill="currentColor" />
          {/* Top Stepped Pedestal & Ceremonial Urn */}
          <rect x="372" y="82" width="86" height="6" fill="currentColor" />
          <rect x="388" y="76" width="54" height="6" fill="currentColor" />
          <path d="M404 76 C404 66 426 66 426 76 Z" fill="currentColor" />

          {/* 4. RASHTRAPATI BHAVAN / CENTRAL VISTA (Center-Right, x=530 to x=790) */}
          {/* Grand Colonnade Base */}
          <rect x="540" y="180" width="240" height="56" fill="currentColor" />
          <rect x="526" y="228" width="268" height="8" fill="currentColor" />
          {/* Colonnade Pillars */}
          <line x1="570" y1="180" x2="570" y2="228" stroke="currentColor" strokeWidth="4" />
          <line x1="600" y1="180" x2="600" y2="228" stroke="currentColor" strokeWidth="4" />
          <line x1="630" y1="180" x2="630" y2="228" stroke="currentColor" strokeWidth="4" />
          <line x1="660" y1="180" x2="660" y2="228" stroke="currentColor" strokeWidth="4" />
          <line x1="690" y1="180" x2="690" y2="228" stroke="currentColor" strokeWidth="4" />
          <line x1="720" y1="180" x2="720" y2="228" stroke="currentColor" strokeWidth="4" />
          <line x1="750" y1="180" x2="750" y2="228" stroke="currentColor" strokeWidth="4" />
          {/* Pediment */}
          <polygon points="620,180 660,154 700,180" fill="currentColor" />
          {/* Grand Copper Dome on Drum */}
          <rect x="632" y="126" width="56" height="28" fill="currentColor" />
          <path d="M632 126 C632 76 688 76 688 126 Z" fill="currentColor" />
          {/* Finial / Spire */}
          <rect x="656" y="66" width="8" height="10" fill="currentColor" />
          <line x1="660" y1="66" x2="660" y2="48" stroke="currentColor" strokeWidth="3" />

          {/* 5. RED FORT BASTIONS & CHHATRIS (Right, x=830 to x=1180) */}
          {/* Fortified Rampart Wall */}
          <path
            d="M840 236 L840 180 L860 180 L860 162 L900 162 L900 180 L930 180 L930 156 L970 156 L970 180 L1010 180 L1010 150 L1060 150 L1060 180 L1110 180 L1110 162 L1150 162 L1150 180 L1180 180 L1180 236 Z"
            fill="currentColor"
          />
          {/* Chhatri Dome 1 */}
          <path d="M870 152 C870 136 890 136 890 152 Z" fill="currentColor" />
          <line x1="880" y1="136" x2="880" y2="124" stroke="currentColor" strokeWidth="2" />
          {/* Chhatri Dome 2 (Center Pavilion) */}
          <path d="M936 146 C936 126 964 126 964 146 Z" fill="currentColor" />
          <line x1="950" y1="126" x2="950" y2="110" stroke="currentColor" strokeWidth="2.5" />
          {/* Chhatri Dome 3 */}
          <path d="M1020 140 C1020 122 1050 122 1050 140 Z" fill="currentColor" />
          <line x1="1035" y1="122" x2="1035" y2="106" stroke="currentColor" strokeWidth="2.5" />
          {/* Right Minaret Tower */}
          <rect x="1118" y="120" width="24" height="116" fill="currentColor" />
          <path d="M1114 120 C1114 102 1146 102 1146 120 Z" fill="currentColor" />
          <line x1="1130" y1="102" x2="1130" y2="86" stroke="currentColor" strokeWidth="2" />
        </g>
      </svg>
    );
  }

  // 2. Mumbai: Gateway of India + Taj Mahal Palace + Bandra-Worli Sea Link + Rajabai Tower
  if (normalizedId.includes('mumbai') || normalizedId.includes('bombay')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Mumbai coastal architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background skyline & ships */}
        <g style={{ color: fill }} opacity={isDark ? '0.25' : '0.3'}>
          {/* Distant coastal high-rises */}
          <rect x="80" y="160" width="45" height="80" fill="currentColor" />
          <rect x="140" y="140" width="50" height="100" fill="currentColor" />
          <polygon points="140,140 165,115 190,140" fill="currentColor" />
          <rect x="940" y="150" width="60" height="90" fill="currentColor" />
          <rect x="1020" y="130" width="75" height="110" fill="currentColor" />
          <line x1="1057" y1="130" x2="1057" y2="95" stroke="currentColor" strokeWidth="3" />
        </g>

        {/* Foreground prominent Mumbai landmarks */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          {/* Baseline coastal promenade & waves */}
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. BANDRA-WORLI SEA LINK (Left, x=40 to x=320) */}
          {/* Main cable-stayed pylon tower */}
          <polygon points="170,236 182,54 192,54 204,236" fill="currentColor" />
          <polygon points="182,90 192,90 190,180 184,180" fill="currentColor" />
          {/* Radiating stay cables */}
          <line x1="187" y1="80" x2="70" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="100" x2="100" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="120" x2="130" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="140" x2="155" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="80" x2="300" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="100" x2="270" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="120" x2="240" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="140" x2="215" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          {/* Elevated viaduct roadway */}
          <rect x="30" y="222" width="310" height="8" rx="2" fill="currentColor" />

          {/* 2. GATEWAY OF INDIA (Center-Left, x=370 to x=560) */}
          {/* Stepped sea plinth */}
          <rect x="370" y="230" width="190" height="6" fill="currentColor" />
          <rect x="380" y="224" width="170" height="6" fill="currentColor" />
          {/* Left Turret Pier */}
          <rect x="388" y="128" width="26" height="96" fill="currentColor" />
          <path d="M384 128 L418 128 L418 114 C418 100 384 100 384 114 Z" fill="currentColor" />
          <line x1="401" y1="100" x2="401" y2="88" stroke="currentColor" strokeWidth="2.5" />
          {/* Right Turret Pier */}
          <rect x="526" y="128" width="26" height="96" fill="currentColor" />
          <path d="M522 128 L556 128 L556 114 C556 100 522 100 522 114 Z" fill="currentColor" />
          <line x1="539" y1="100" x2="539" y2="88" stroke="currentColor" strokeWidth="2.5" />
          {/* Central Monumental Arch Wall */}
          <rect x="414" y="116" width="112" height="108" fill="currentColor" />
          {/* Grand Arch Opening */}
          <path
            d="M442 224 L442 160 C442 126 498 126 498 160 L498 224 Z"
            fill="currentColor"
          />
          {/* Central Dome Rising Behind Parapet */}
          <path d="M446 116 C446 80 494 80 494 116 Z" fill="currentColor" />
          <line x1="470" y1="80" x2="470" y2="66" stroke="currentColor" strokeWidth="2.5" />
          {/* Cornice parapet */}
          <rect x="380" y="116" width="180" height="6" rx="1" fill="currentColor" />

          {/* 3. TAJ MAHAL PALACE (Center-Right, x=600 to x=860) */}
          {/* Base facade */}
          <rect x="610" y="156" width="240" height="80" fill="currentColor" />
          {/* Left Wing Tower */}
          <rect x="610" y="130" width="45" height="106" fill="currentColor" />
          <path d="M605 130 C605 108 660 108 660 130 Z" fill="currentColor" />
          <line x1="632" y1="108" x2="632" y2="94" stroke="currentColor" strokeWidth="2" />
          {/* Right Wing Tower */}
          <rect x="805" y="130" width="45" height="106" fill="currentColor" />
          <path d="M800 130 C800 108 855 108 855 130 Z" fill="currentColor" />
          <line x1="827" y1="108" x2="827" y2="94" stroke="currentColor" strokeWidth="2" />
          {/* Grand Central Red Onion Dome */}
          <rect x="702" y="138" width="56" height="18" fill="currentColor" />
          <path
            d="M700 138 C694 100 730 68 730 68 C730 68 766 100 760 138 Z"
            fill="currentColor"
          />
          <line x1="730" y1="68" x2="730" y2="48" stroke="currentColor" strokeWidth="3" />

          {/* 4. RAJABAI CLOCK TOWER & HIGH COURT (Right, x=890 to x=1160) */}
          {/* Clock Tower Base */}
          <rect x="910" y="146" width="48" height="90" fill="currentColor" />
          {/* Upper Clock Room */}
          <rect x="914" y="96" width="40" height="50" fill="currentColor" />
          {/* Clock Face Circle cutout/detail */}
          <circle cx="934" cy="118" r="8" fill="currentColor" opacity="0.3" />
          {/* Soaring Venetian Gothic Spire */}
          <polygon points="914,96 934,28 954,96" fill="currentColor" />
          <line x1="934" y1="28" x2="934" y2="14" stroke="currentColor" strokeWidth="2.5" />
          {/* Bombay High Court Gabled Wings */}
          <polygon points="965,236 965,160 1000,136 1035,160 1035,236" fill="currentColor" />
          <polygon points="1035,236 1035,160 1070,136 1105,160 1105,236" fill="currentColor" />
          <rect x="1110" y="166" width="60" height="70" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 3. Bengaluru: Vidhana Soudha + Bangalore Palace + Attara Kacheri + High-Tech Spire
  if (normalizedId.includes('bengaluru') || normalizedId.includes('bangalore')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Bengaluru heritage and tech architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background tech hub towers */}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="80" y="140" width="70" height="100" fill="currentColor" />
          <rect x="170" y="120" width="85" height="120" fill="currentColor" />
          <polygon points="170,120 212,85 255,120" fill="currentColor" />
          <rect x="920" y="130" width="60" height="110" fill="currentColor" />
          <rect x="1000" y="105" width="80" height="135" fill="currentColor" />
          <line x1="1040" y1="105" x2="1040" y2="65" stroke="currentColor" strokeWidth="3" />
        </g>

        {/* Foreground prominent Bengaluru landmarks */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. BANGALORE PALACE (Left, x=40 to x=280) */}
          {/* Tudor Turrets and Battlements */}
          <rect x="50" y="140" width="36" height="96" fill="currentColor" />
          <polygon points="46,140 68,110 90,140" fill="currentColor" />
          <rect x="86" y="160" width="60" height="76" fill="currentColor" />
          {/* Crenellated wall */}
          <path
            d="M86 160 L86 150 L98 150 L98 160 L110 160 L110 150 L122 150 L122 160 L134 160 L134 150 L146 150 L146 160 Z"
            fill="currentColor"
          />
          {/* Main Palace Tower */}
          <rect x="146" y="118" width="52" height="118" fill="currentColor" />
          <polygon points="140,118 172,78 204,118" fill="currentColor" />
          <line x1="172" y1="78" x2="172" y2="58" stroke="currentColor" strokeWidth="2.5" />
          <rect x="198" y="152" width="70" height="84" fill="currentColor" />

          {/* 2. VIDHANA SOUDHA (Center, x=330 to x=820) */}
          {/* Grand flight of entrance stairs & terrace */}
          <rect x="330" y="230" width="480" height="6" fill="currentColor" />
          <rect x="350" y="224" width="440" height="6" fill="currentColor" />
          <rect x="370" y="218" width="400" height="6" fill="currentColor" />
          {/* Main Facade Structure */}
          <rect x="380" y="152" width="380" height="66" fill="currentColor" />
          {/* Left Wing Dome */}
          <rect x="396" y="134" width="42" height="18" fill="currentColor" />
          <path d="M394 134 C394 105 440 105 440 134 Z" fill="currentColor" />
          <line x1="417" y1="105" x2="417" y2="90" stroke="currentColor" strokeWidth="2.5" />
          {/* Right Wing Dome */}
          <rect x="702" y="134" width="42" height="18" fill="currentColor" />
          <path d="M700 134 C700 105 746 105 746 134 Z" fill="currentColor" />
          <line x1="723" y1="105" x2="723" y2="90" stroke="currentColor" strokeWidth="2.5" />
          {/* Grand Colonnaded Portico */}
          <polygon points="500,152 570,120 640,152" fill="currentColor" />
          <rect x="510" y="152" width="120" height="66" fill="currentColor" />
          <line x1="530" y1="152" x2="530" y2="218" stroke="currentColor" strokeWidth="5" />
          <line x1="555" y1="152" x2="555" y2="218" stroke="currentColor" strokeWidth="5" />
          <line x1="585" y1="152" x2="585" y2="218" stroke="currentColor" strokeWidth="5" />
          <line x1="610" y1="152" x2="610" y2="218" stroke="currentColor" strokeWidth="5" />
          {/* Central Neo-Dravidian Monumental Dome Drum */}
          <rect x="532" y="96" width="76" height="26" fill="currentColor" />
          {/* Central Grand Dome */}
          <path d="M530 96 C530 46 610 46 610 96 Z" fill="currentColor" />
          {/* Ashok Stambha / 4 Lions Capital finial */}
          <rect x="564" y="32" width="12" height="14" fill="currentColor" />
          <line x1="570" y1="32" x2="570" y2="16" stroke="currentColor" strokeWidth="3" />

          {/* 3. ATTARA KACHERI & TECH PARK SPHERES (Right, x=860 to x=1160) */}
          {/* Attara Kacheri (High Court) Classical Block */}
          <rect x="860" y="168" width="150" height="68" fill="currentColor" />
          <polygon points="885,168 935,138 985,168" fill="currentColor" />
          {/* Tech Park High-Rise Glass Spire */}
          <polygon points="1030,236 1030,110 1065,70 1100,110 1100,236" fill="currentColor" />
          <line x1="1065" y1="70" x2="1065" y2="34" stroke="currentColor" strokeWidth="3" />
          <rect x="1110" y="135" width="55" height="101" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 4. Kolkata: Howrah Bridge + Victoria Memorial + St. Paul's Cathedral
  if (normalizedId.includes('kolkata') || normalizedId.includes('calcutta')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Kolkata heritage and Hooghly architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background layer */}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="110" y="160" width="70" height="80" fill="currentColor" />
          <polygon points="110,160 145,130 180,160" fill="currentColor" />
          <rect x="960" y="140" width="85" height="100" fill="currentColor" />
          <line x1="1002" y1="140" x2="1002" y2="90" stroke="currentColor" strokeWidth="3" />
        </g>

        {/* Foreground prominent Kolkata landmarks */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. HOWRAH BRIDGE (Left, x=40 to x=430) */}
          {/* Main Cantilever Tower Pier */}
          <polygon points="190,236 215,64 235,64 260,236" fill="currentColor" />
          {/* Tower portal truss cutout */}
          <polygon points="215,100 235,100 245,210 205,210" fill="currentColor" />
          {/* Diagonal suspension truss girders */}
          <line x1="225" y1="74" x2="50" y2="216" stroke="currentColor" strokeWidth="3.5" />
          <line x1="225" y1="74" x2="380" y2="216" stroke="currentColor" strokeWidth="3.5" />
          <line x1="225" y1="110" x2="100" y2="216" stroke="currentColor" strokeWidth="2.5" />
          <line x1="225" y1="110" x2="330" y2="216" stroke="currentColor" strokeWidth="2.5" />
          <line x1="225" y1="150" x2="150" y2="216" stroke="currentColor" strokeWidth="2" />
          <line x1="225" y1="150" x2="280" y2="216" stroke="currentColor" strokeWidth="2" />
          {/* Suspended Bridge Deck */}
          <rect x="30" y="214" width="390" height="10" rx="2" fill="currentColor" />

          {/* 2. VICTORIA MEMORIAL (Center, x=470 to x=880) */}
          {/* Reflecting Pool Base & Steps */}
          <rect x="480" y="230" width="380" height="6" fill="currentColor" />
          <rect x="500" y="224" width="340" height="6" fill="currentColor" />
          {/* Main Marble Facade */}
          <rect x="510" y="162" width="320" height="62" fill="currentColor" />
          {/* Left Renaissance Corner Cupola */}
          <rect x="524" y="144" width="38" height="18" fill="currentColor" />
          <path d="M522 144 C522 118 564 118 564 144 Z" fill="currentColor" />
          <line x1="543" y1="118" x2="543" y2="106" stroke="currentColor" strokeWidth="2" />
          {/* Right Renaissance Corner Cupola */}
          <rect x="778" y="144" width="38" height="18" fill="currentColor" />
          <path d="M776 144 C776 118 818 118 818 144 Z" fill="currentColor" />
          <line x1="797" y1="118" x2="797" y2="106" stroke="currentColor" strokeWidth="2" />
          {/* Colonnaded Portico with Pediment */}
          <polygon points="620,162 670,132 720,162" fill="currentColor" />
          <rect x="630" y="162" width="80" height="62" fill="currentColor" />
          <line x1="645" y1="162" x2="645" y2="224" stroke="currentColor" strokeWidth="4" />
          <line x1="670" y1="162" x2="670" y2="224" stroke="currentColor" strokeWidth="4" />
          <line x1="695" y1="162" x2="695" y2="224" stroke="currentColor" strokeWidth="4" />
          {/* Central Monumental Marble Dome Drum */}
          <rect x="636" y="104" width="68" height="28" fill="currentColor" />
          {/* Grand Dome */}
          <path d="M634 104 C634 48 706 48 706 104 Z" fill="currentColor" />
          {/* Lantern & Angel of Victory */}
          <rect x="664" y="38" width="12" height="10" fill="currentColor" />
          <line x1="670" y1="38" x2="670" y2="20" stroke="currentColor" strokeWidth="3" />
          {/* Angel with outstretched wings */}
          <path d="M658 20 Q670 14 682 20 Q670 26 658 20 Z" fill="currentColor" />

          {/* 3. ST. PAUL'S CATHEDRAL & SHAHEED MINAR (Right, x=910 to x=1160) */}
          {/* Cathedral Base */}
          <rect x="920" y="168" width="130" height="66" fill="currentColor" />
          {/* Gothic Cathedral Tower */}
          <rect x="955" y="100" width="46" height="68" fill="currentColor" />
          <polygon points="950,100 978,42 1006,100" fill="currentColor" />
          <line x1="978" y1="42" x2="978" y2="26" stroke="currentColor" strokeWidth="2.5" />
          {/* Shaheed Minar Fluted Column */}
          <rect x="1086" y="110" width="18" height="124" fill="currentColor" />
          <path d="M1080 110 C1080 88 1110 88 1110 110 Z" fill="currentColor" />
          <line x1="1095" y1="88" x2="1095" y2="70" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 5. Lucknow: Rumi Darwaza + Bara Imambara + Asfi Mosque + Clock Tower
  if (normalizedId.includes('lucknow')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Lucknow Awadhi architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background minarets */}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="140" y="120" width="20" height="120" fill="currentColor" />
          <path d="M136 120 C136 100 164 100 164 120 Z" fill="currentColor" />
          <rect x="1020" y="110" width="22" height="130" fill="currentColor" />
          <path d="M1016 110 C1016 90 1046 90 1046 110 Z" fill="currentColor" />
        </g>

        {/* Foreground prominent Lucknow Awadhi landmarks */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. ASFI MOSQUE & MINARETS (Left, x=40 to x=320) */}
          {/* Left Octagonal Minaret */}
          <rect x="60" y="90" width="26" height="146" fill="currentColor" />
          <path d="M55 90 C55 68 91 68 91 90 Z" fill="currentColor" />
          <line x1="73" y1="68" x2="73" y2="52" stroke="currentColor" strokeWidth="2.5" />
          {/* Mosque Facade Arches */}
          <rect x="86" y="160" width="180" height="76" fill="currentColor" />
          <path d="M110 236 L110 185 C110 165 145 165 145 185 L145 236 Z" fill="currentColor" />
          <path d="M165 236 L165 180 C165 155 205 155 205 180 L205 236 Z" fill="currentColor" />
          <path d="M225 236 L225 185 C225 165 260 165 260 185 L260 236 Z" fill="currentColor" />
          {/* Mosque Domes */}
          <path d="M112 160 C112 130 148 130 148 160 Z" fill="currentColor" />
          <path d="M166 160 C166 120 208 120 208 160 Z" fill="currentColor" />
          <path d="M226 160 C226 130 262 130 262 160 Z" fill="currentColor" />

          {/* 2. RUMI DARWAZA (Center, x=380 to x=680) */}
          {/* Left Octagonal Turret */}
          <rect x="400" y="104" width="30" height="132" fill="currentColor" />
          <path d="M394 104 C394 84 436 84 436 104 Z" fill="currentColor" />
          <line x1="415" y1="84" x2="415" y2="68" stroke="currentColor" strokeWidth="2.5" />
          {/* Right Octagonal Turret */}
          <rect x="630" y="104" width="30" height="132" fill="currentColor" />
          <path d="M624 104 C624 84 666 84 666 104 Z" fill="currentColor" />
          <line x1="645" y1="84" x2="645" y2="68" stroke="currentColor" strokeWidth="2.5" />
          {/* Grand Awadhi Parabolic Archway */}
          <path
            d="M430 236 L430 156 C430 68 530 46 530 46 C530 46 630 68 630 156 L630 236 Z"
            fill="currentColor"
          />
          {/* Recessed Cusped Arch Opening */}
          <path
            d="M465 236 L465 170 C465 110 530 96 530 96 C530 96 595 110 595 170 L595 236 Z"
            fill="currentColor"
          />
          {/* Apex Crowning Chhatri Kiosk */}
          <rect x="516" y="46" width="28" height="14" fill="currentColor" />
          <path d="M512 46 C512 28 548 28 548 46 Z" fill="currentColor" />
          <line x1="530" y1="28" x2="530" y2="14" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. BARA IMAMBARA & HUSAINABAD CLOCK TOWER (Right, x=720 to x=1160) */}
          {/* Imambara Grand Gateway */}
          <rect x="730" y="162" width="180" height="74" fill="currentColor" />
          <path d="M780 236 L780 185 C780 165 860 165 860 185 L860 236 Z" fill="currentColor" />
          <rect x="730" y="152" width="180" height="10" fill="currentColor" />
          {/* Rooftop ornamental chhatris */}
          <path d="M750 152 C750 136 774 136 774 152 Z" fill="currentColor" />
          <path d="M808 152 C808 132 832 132 832 152 Z" fill="currentColor" />
          <path d="M866 152 C866 136 890 136 890 152 Z" fill="currentColor" />
          {/* Husainabad Gothic Clock Tower */}
          <rect x="960" y="90" width="48" height="146" fill="currentColor" />
          <rect x="966" y="46" width="36" height="44" fill="currentColor" />
          <circle cx="984" cy="68" r="8" fill="currentColor" opacity="0.3" />
          <polygon points="966,46 984,12 1002,46" fill="currentColor" />
          <line x1="984" y1="12" x2="984" y2="2" stroke="currentColor" strokeWidth="2.5" />
          <rect x="1030" y="168" width="120" height="68" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 6. Gurugram: Rapid Metro Elevated Viaduct + Cyber City Spire + One Horizon
  if (normalizedId.includes('gurugram') || normalizedId.includes('gurgaon')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Gurugram Cyber City futuristic skyline silhouette"
      >
        {clouds}
        {/* Distant background modern towers */}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="120" y="120" width="80" height="120" fill="currentColor" />
          <rect x="230" y="100" width="70" height="140" fill="currentColor" />
          <polygon points="230,100 265,65 300,100" fill="currentColor" />
          <rect x="900" y="110" width="90" height="130" fill="currentColor" />
          <rect x="1010" y="90" width="110" height="150" fill="currentColor" />
        </g>

        {/* Foreground prominent Cyber City towers */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* Tower 1 (Left Horizon Crystalline Angled Crown) */}
          <polygon points="60,236 60,90 120,44 170,72 170,236" fill="currentColor" />
          {/* Diagrid structural patterns */}
          <line x1="60" y1="130" x2="170" y2="190" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <line x1="170" y1="130" x2="60" y2="190" stroke="currentColor" strokeWidth="2" opacity="0.4" />

          {/* Tower 2 (Building 10 Commercial High-Rise with Spire) */}
          <rect x="200" y="106" width="90" height="130" fill="currentColor" />
          <line x1="245" y1="106" x2="245" y2="48" stroke="currentColor" strokeWidth="3.5" />
          <rect x="215" y="120" width="60" height="6" fill="currentColor" opacity="0.3" />
          <rect x="215" y="145" width="60" height="6" fill="currentColor" opacity="0.3" />
          <rect x="215" y="170" width="60" height="6" fill="currentColor" opacity="0.3" />

          {/* Skywalk Bridge */}
          <rect x="170" y="158" width="30" height="12" fill="currentColor" />

          {/* Tower 3 (One Horizon Center - Soaring Modernist Apex) */}
          <polygon points="320,236 320,78 375,32 430,78 430,236" fill="currentColor" />
          <line x1="375" y1="32" x2="375" y2="12" stroke="currentColor" strokeWidth="3" />

          {/* Tower 4 (Curved Aerodynamic Glass High-Rise) */}
          <path
            d="M460 236 L460 88 C460 50 560 50 560 88 L560 236 Z"
            fill="currentColor"
          />
          <line x1="510" y1="52" x2="510" y2="28" stroke="currentColor" strokeWidth="3" />

          {/* Tower 5 & 6 (Cyber Hub Commercial Complex) */}
          <rect x="590" y="112" width="110" height="124" fill="currentColor" />
          <polygon points="720,236 720,95 780,60 840,95 840,236" fill="currentColor" />
          <line x1="780" y1="60" x2="780" y2="30" stroke="currentColor" strokeWidth="3" />
          <rect x="870" y="125" width="95" height="111" fill="currentColor" />
          <rect x="990" y="105" width="140" height="131" fill="currentColor" />
          <polygon points="990,105 1060,55 1130,105" fill="currentColor" />

          {/* RAPID METRO ELEVATED VIADUCT (Spans across the bottom, x=0 to x=1200) */}
          <rect x="0" y="196" width="1200" height="12" rx="2" fill="currentColor" />
          <rect x="0" y="204" width="1200" height="4" fill="currentColor" opacity="0.5" />
          {/* Viaduct support pillars */}
          <rect x="80" y="208" width="14" height="28" fill="currentColor" />
          <rect x="220" y="208" width="14" height="28" fill="currentColor" />
          <rect x="360" y="208" width="14" height="28" fill="currentColor" />
          <rect x="500" y="208" width="14" height="28" fill="currentColor" />
          <rect x="640" y="208" width="14" height="28" fill="currentColor" />
          <rect x="780" y="208" width="14" height="28" fill="currentColor" />
          <rect x="920" y="208" width="14" height="28" fill="currentColor" />
          <rect x="1060" y="208" width="14" height="28" fill="currentColor" />
          {/* Metro Train on the elevated viaduct */}
          <rect x="420" y="186" width="110" height="10" rx="3" fill="currentColor" />
          <rect x="428" y="188" width="16" height="4" fill="currentColor" opacity="0.3" />
          <rect x="450" y="188" width="16" height="4" fill="currentColor" opacity="0.3" />
          <rect x="472" y="188" width="16" height="4" fill="currentColor" opacity="0.3" />
          <rect x="494" y="188" width="16" height="4" fill="currentColor" opacity="0.3" />
        </g>
      </svg>
    );
  }

  // 7. Noida: Supernova Towers + Civic Buddh Stupa + Expressway
  if (normalizedId.includes('noida')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Noida civic stupa and expressway towers skyline silhouette"
      >
        {clouds}
        {/* Distant background towers */}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="100" y="130" width="75" height="110" fill="currentColor" />
          <rect x="200" y="110" width="85" height="130" fill="currentColor" />
          <rect x="940" y="120" width="90" height="120" fill="currentColor" />
        </g>

        {/* Foreground prominent Noida landmarks */}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. NOIDA SUPERNOVA HIGH-RISE (Left, x=60 to x=220) */}
          <path
            d="M80 236 L80 62 Q125 32 170 62 L170 236 Z"
            fill="currentColor"
          />
          <line x1="125" y1="38" x2="125" y2="16" stroke="currentColor" strokeWidth="3" />
          {/* Spira Tower with Telecommunication Mast */}
          <rect x="195" y="88" width="60" height="148" fill="currentColor" />
          <line x1="225" y1="88" x2="225" y2="40" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="225" cy="40" r="4" fill="currentColor" />

          {/* 2. GRAND BUDDH CIVIC STUPA (Center, x=380 to x=780) */}
          {/* Stepped Circular Terrace Plinths */}
          <rect x="380" y="230" width="400" height="6" fill="currentColor" />
          <rect x="410" y="222" width="340" height="8" fill="currentColor" />
          <rect x="440" y="214" width="280" height="8" fill="currentColor" />
          {/* Semi-Hemispherical Anda Dome */}
          <path
            d="M450 214 C450 120 710 120 710 214 Z"
            fill="currentColor"
          />
          {/* Harmika Square Box */}
          <rect x="556" y="104" width="48" height="20" fill="currentColor" />
          {/* Chhatravali 3-Tier Honorary Umbrella Spire */}
          <rect x="540" y="94" width="80" height="6" rx="2" fill="currentColor" />
          <rect x="550" y="84" width="60" height="5" rx="2" fill="currentColor" />
          <rect x="560" y="74" width="40" height="5" rx="2" fill="currentColor" />
          <line x1="580" y1="104" x2="580" y2="52" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="580" cy="52" r="3" fill="currentColor" />

          {/* 3. EXPRESS HIGHWAY TOWERS & SPRAWS (Right, x=840 to x=1160) */}
          <polygon points="850,236 850,110 900,75 950,110 950,236" fill="currentColor" />
          <line x1="900" y1="75" x2="900" y2="45" stroke="currentColor" strokeWidth="3" />
          <rect x="975" y="98" width="80" height="138" fill="currentColor" />
          <polygon points="1075,236 1075,85 1145,50 1145,236" fill="currentColor" />
          <line x1="1110" y1="65" x2="1110" y2="35" stroke="currentColor" strokeWidth="3" />
        </g>
      </svg>
    );
  }

  // 8. Chennai: Kapaleeshwarar Temple Gopuram + Ripon Building + Central Railway Station + Marina Coast
  if (normalizedId.includes('chennai') || normalizedId.includes('madras')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Chennai heritage Dravidian and coastal architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="90" y="150" width="80" height="90" fill="currentColor" />
          <rect x="220" y="130" width="70" height="110" fill="currentColor" />
          <rect x="920" y="140" width="90" height="100" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. MARINA LIGHTHOUSE & COASTLINE (Left, x=60 to x=280) */}
          <polygon points="120,236 135,76 150,76 165,236" fill="currentColor" />
          <rect x="130" y="66" width="25" height="10" fill="currentColor" />
          <path d="M128 66 C128 48 157 48 157 66 Z" fill="currentColor" />
          <line x1="142" y1="48" x2="142" y2="30" stroke="currentColor" strokeWidth="2.5" />
          <rect x="175" y="180" width="90" height="56" fill="currentColor" />

          {/* 2. KAPALEESHWARAR TEMPLE GOPURAM (Center, x=360 to x=620) */}
          {/* Stepped Base Plinth */}
          <rect x="390" y="226" width="200" height="10" fill="currentColor" />
          <rect x="410" y="216" width="160" height="10" fill="currentColor" />
          {/* Main Tapering Pyramidal Dravidian Tower */}
          <polygon points="410,216 450,68 530,68 570,216" fill="currentColor" />
          {/* 5 Stepped Cornice Tiers */}
          <rect x="418" y="184" width="144" height="6" rx="1" fill="currentColor" />
          <rect x="428" y="154" width="124" height="6" rx="1" fill="currentColor" />
          <rect x="438" y="124" width="104" height="6" rx="1" fill="currentColor" />
          <rect x="448" y="96" width="84" height="5" rx="1" fill="currentColor" />
          <rect x="454" y="74" width="72" height="5" rx="1" fill="currentColor" />
          {/* Crown Barrel-Vault Sala Roof */}
          <path d="M446 68 C446 44 534 44 534 68 Z" fill="currentColor" />
          {/* Row of Golden Kalasam Spires */}
          <line x1="462" y1="44" x2="462" y2="28" stroke="currentColor" strokeWidth="2.5" />
          <line x1="476" y1="42" x2="476" y2="24" stroke="currentColor" strokeWidth="2.5" />
          <line x1="490" y1="40" x2="490" y2="20" stroke="currentColor" strokeWidth="3" />
          <line x1="504" y1="42" x2="504" y2="24" stroke="currentColor" strokeWidth="2.5" />
          <line x1="518" y1="44" x2="518" y2="28" stroke="currentColor" strokeWidth="2.5" />
          {/* Monumental Portal Gateway Arch Opening */}
          <path d="M470 236 L470 176 C470 156 510 156 510 176 L510 236 Z" fill="currentColor" opacity="0.3" />

          {/* 3. CHENNAI CENTRAL RAILWAY STATION & RIPON BUILDING (Right, x=680 to x=1140) */}
          <rect x="700" y="172" width="240" height="64" fill="currentColor" />
          {/* Victorian Gothic Clock Tower */}
          <rect x="780" y="86" width="50" height="150" fill="currentColor" />
          <circle cx="805" cy="118" r="9" fill="currentColor" opacity="0.3" />
          <polygon points="775,86 805,32 835,86" fill="currentColor" />
          <line x1="805" y1="32" x2="805" y2="16" stroke="currentColor" strokeWidth="3" />
          {/* Ripon Building White Classical Domes */}
          <rect x="940" y="160" width="170" height="76" fill="currentColor" />
          <path d="M960 160 C960 128 1010 128 1010 160 Z" fill="currentColor" />
          <path d="M1020 160 C1020 108 1090 108 1090 160 Z" fill="currentColor" />
          <line x1="1055" y1="108" x2="1055" y2="88" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 9. Hyderabad: Charminar + Hussain Sagar Buddha + Golconda Fort
  if (normalizedId.includes('hyderabad') || normalizedId.includes('secunderabad')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Hyderabad Charminar and Deccan architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="100" y="140" width="80" height="100" fill="currentColor" />
          <rect x="240" y="120" width="70" height="120" fill="currentColor" />
          <rect x="960" y="130" width="100" height="110" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. HUSSAIN SAGAR MONOLITHIC BUDDHA (Left, x=80 to x=260) */}
          <rect x="120" y="218" width="100" height="18" fill="currentColor" />
          <polygon points="135,218 145,188 195,188 205,218" fill="currentColor" />
          <rect x="160" y="130" width="20" height="58" rx="4" fill="currentColor" />
          <circle cx="170" cy="116" r="10" fill="currentColor" />
          <line x1="170" y1="106" x2="170" y2="98" stroke="currentColor" strokeWidth="3" />

          {/* 2. CHARMINAR (Center, x=360 to x=720) */}
          {/* Main Central Block */}
          <rect x="420" y="126" width="240" height="110" fill="currentColor" />
          {/* Four Grand Arches Opening */}
          <path d="M470 236 L470 165 C470 125 610 125 610 165 L610 236 Z" fill="currentColor" opacity="0.3" />
          {/* Upper Double-Deck Arcade */}
          <rect x="415" y="112" width="250" height="14" fill="currentColor" />
          <rect x="430" y="96" width="220" height="16" fill="currentColor" />
          {/* Left Corner Minaret Tower */}
          <polygon points="380,236 394,48 408,48 420,236" fill="currentColor" />
          <rect x="388" y="170" width="24" height="6" rx="1" fill="currentColor" />
          <rect x="390" y="120" width="20" height="5" rx="1" fill="currentColor" />
          <rect x="392" y="76" width="16" height="5" rx="1" fill="currentColor" />
          <path d="M392 48 C392 30 410 30 410 48 Z" fill="currentColor" />
          <line x1="401" y1="30" x2="401" y2="16" stroke="currentColor" strokeWidth="2.5" />
          {/* Inner Left Minaret */}
          <polygon points="424,126 430,48 442,48 446,126" fill="currentColor" />
          <path d="M428 48 C428 32 444 32 444 48 Z" fill="currentColor" />
          <line x1="436" y1="32" x2="436" y2="18" stroke="currentColor" strokeWidth="2" />
          {/* Inner Right Minaret */}
          <polygon points="634,126 638,48 650,48 656,126" fill="currentColor" />
          <path d="M636 48 C636 32 652 32 652 48 Z" fill="currentColor" />
          <line x1="644" y1="32" x2="644" y2="18" stroke="currentColor" strokeWidth="2" />
          {/* Right Corner Minaret Tower */}
          <polygon points="660,236 672,48 686,48 700,236" fill="currentColor" />
          <rect x="668" y="170" width="24" height="6" rx="1" fill="currentColor" />
          <rect x="670" y="120" width="20" height="5" rx="1" fill="currentColor" />
          <rect x="672" y="76" width="16" height="5" rx="1" fill="currentColor" />
          <path d="M672 48 C672 30 690 30 690 48 Z" fill="currentColor" />
          <line x1="681" y1="30" x2="681" y2="16" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. GOLCONDA FORT RAMPARTS (Right, x=780 to x=1160) */}
          <path d="M780 236 L780 180 L810 180 L810 160 L850 160 L850 180 L890 180 L890 150 L940 150 L940 180 L990 180 L990 140 L1050 140 L1050 180 L1110 180 L1110 155 L1160 155 L1160 236 Z" fill="currentColor" />
          <path d="M865 150 C865 132 895 132 895 150 Z" fill="currentColor" />
          <path d="M1010 140 C1010 120 1045 120 1045 140 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 10. Ahmedabad: Sidi Saiyyed Mosque Tree of Life + Adalaj Stepwell + Atal Pedestrian Bridge
  if (normalizedId.includes('ahmedabad') || normalizedId.includes('amdavad')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Ahmedabad heritage architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="80" y="140" width="70" height="100" fill="currentColor" />
          <rect x="190" y="120" width="80" height="120" fill="currentColor" />
          <rect x="940" y="130" width="80" height="110" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. ATAL PEDESTRIAN BRIDGE (Left, x=60 to x=360) */}
          <path d="M70 236 Q210 120 350 236 Z" fill="currentColor" opacity="0.3" />
          <path d="M80 236 Q210 140 340 236" stroke="currentColor" strokeWidth="4" fill="none" />
          <line x1="140" y1="190" x2="140" y2="236" stroke="currentColor" strokeWidth="2.5" />
          <line x1="210" y1="160" x2="210" y2="236" stroke="currentColor" strokeWidth="3" />
          <line x1="280" y1="190" x2="280" y2="236" stroke="currentColor" strokeWidth="2.5" />

          {/* 2. SIDI SAIYYED MOSQUE JALI ARCHES (Center, x=390 to x=720) */}
          {/* Main Stone Wall Facade */}
          <rect x="410" y="120" width="280" height="116" fill="currentColor" />
          {/* Left Semi-Circular Jaali Arch */}
          <path d="M430 236 L430 170 C430 130 520 130 520 170 L520 236 Z" fill="currentColor" opacity="0.3" />
          {/* Right Semi-Circular Jaali Arch (Tree of Life) */}
          <path d="M570 236 L570 170 C570 130 660 130 660 170 L660 236 Z" fill="currentColor" opacity="0.3" />
          {/* Flanking Ornate Minaret Turrets */}
          <polygon points="390,236 400,80 412,80 422,236" fill="currentColor" />
          <path d="M400 80 C400 62 412 62 412 80 Z" fill="currentColor" />
          <line x1="406" y1="62" x2="406" y2="46" stroke="currentColor" strokeWidth="2" />
          <polygon points="678,236 688,80 700,80 710,236" fill="currentColor" />
          <path d="M688 80 C688 62 700 62 700 80 Z" fill="currentColor" />
          <line x1="694" y1="62" x2="694" y2="46" stroke="currentColor" strokeWidth="2" />

          {/* 3. ADALAJ STEPWELL PAVILIONS (Right, x=760 to x=1160) */}
          <rect x="780" y="170" width="200" height="66" fill="currentColor" />
          <polygon points="800,170 840,140 880,170" fill="currentColor" />
          <polygon points="900,170 940,140 980,170" fill="currentColor" />
          <rect x="1000" y="140" width="130" height="96" fill="currentColor" />
          <path d="M1020 140 C1020 110 1080 110 1080 140 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 11. Pune: Shaniwar Wada Delhi Darwaja + Aga Khan Palace + Sinhagad Fort
  if (normalizedId.includes('pune') || normalizedId.includes('poona')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Pune Shaniwar Wada and Maratha architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <polygon points="60,236 180,140 300,236" fill="currentColor" />
          <rect x="940" y="130" width="90" height="110" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. SINHAGAD FORT RIDGE (Left, x=40 to x=320) */}
          <polygon points="40,236 160,110 240,150 320,236" fill="currentColor" />
          <rect x="150" y="96" width="20" height="14" fill="currentColor" />
          <line x1="160" y1="96" x2="160" y2="76" stroke="currentColor" strokeWidth="2.5" />

          {/* 2. SHANIWAR WADA (DELHI GATE & BASTIONS) (Center, x=380 to x=720) */}
          {/* Main Heavy Basalt Rampart Wall */}
          <rect x="410" y="128" width="260" height="108" fill="currentColor" />
          {/* Left Semi-Circular Fortified Bastion */}
          <path d="M410 236 L410 110 C410 88 470 88 470 110 L470 236 Z" fill="currentColor" />
          {/* Right Semi-Circular Fortified Bastion */}
          <path d="M610 236 L610 110 C610 88 670 88 670 110 L670 236 Z" fill="currentColor" />
          {/* Grand Pointed Arched Delhi Darwaja Opening */}
          <path d="M500 236 L500 160 C500 136 580 136 580 160 L580 236 Z" fill="currentColor" opacity="0.3" />
          {/* Overhanging Machicolation Jharokhas & Battlements */}
          <rect x="480" y="112" width="120" height="16" fill="currentColor" />
          <rect x="490" y="96" width="100" height="16" fill="currentColor" />
          <polygon points="480,96 540,68 600,96" fill="currentColor" />
          <line x1="540" y1="68" x2="540" y2="48" stroke="currentColor" strokeWidth="3" />

          {/* 3. AGA KHAN PALACE (Right, x=760 to x=1160) */}
          <rect x="780" y="160" width="280" height="76" fill="currentColor" />
          {/* Italianate Arcades */}
          <path d="M810 236 L810 185 C810 165 850 165 850 185 L850 236 Z" fill="currentColor" opacity="0.3" />
          <path d="M870 236 L870 185 C870 165 910 165 910 185 L910 236 Z" fill="currentColor" opacity="0.3" />
          <path d="M930 236 L930 185 C930 165 970 165 970 185 L970 236 Z" fill="currentColor" opacity="0.3" />
          <path d="M990 236 L990 185 C990 165 1030 165 1030 185 L1030 236 Z" fill="currentColor" opacity="0.3" />
          {/* Graceful Central Cupola Dome */}
          <path d="M900 160 C900 114 960 114 960 160 Z" fill="currentColor" />
          <line x1="930" y1="114" x2="930" y2="92" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 12. Universal Pan-Indian Metro Horizon (Fallback)
  return (
    <svg
      viewBox="0 0 1200 240"
      preserveAspectRatio="xMidYMax slice"
      className={`${className} transition-all duration-700 pointer-events-none select-none`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Universal Indian metropolitan architectural skyline silhouette"
    >
      {clouds}
      <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
        <rect x="80" y="140" width="80" height="100" fill="currentColor" />
        <rect x="240" y="120" width="90" height="120" fill="currentColor" />
        <rect x="920" y="110" width="95" height="130" fill="currentColor" />
      </g>
      <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
        <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
        {/* Heritage Monumental Dome */}
        <rect x="80" y="160" width="140" height="76" fill="currentColor" />
        <path d="M110 160 C110 108 190 108 190 160 Z" fill="currentColor" />
        <line x1="150" y1="108" x2="150" y2="84" stroke="currentColor" strokeWidth="3" />
        {/* Central Gateway Arch */}
        <rect x="300" y="124" width="160" height="112" fill="currentColor" />
        <path d="M344 236 L344 168 C344 136 416 136 416 168 L416 236 Z" fill="currentColor" />
        {/* Modernist Diagrid High-Rise */}
        <polygon points="530,236 530,90 600,45 670,90 670,236" fill="currentColor" />
        <line x1="600" y1="45" x2="600" y2="20" stroke="currentColor" strokeWidth="3.5" />
        {/* Cable Bridge & Spire Towers */}
        <polygon points="760,236 775,65 785,65 800,236" fill="currentColor" />
        <line x1="780" y1="90" x2="690" y2="236" stroke="currentColor" strokeWidth="2" opacity="0.6" />
        <line x1="780" y1="90" x2="870" y2="236" stroke="currentColor" strokeWidth="2" opacity="0.6" />
        <rect x="910" y="105" width="105" height="131" fill="currentColor" />
        <polygon points="1040,236 1040,80 1100,45 1160,80 1160,236" fill="currentColor" />
      </g>
    </svg>
  );
};
