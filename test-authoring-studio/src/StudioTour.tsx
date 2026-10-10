import { useMemo } from 'react';
import { Joyride, type Step } from 'react-joyride';

export type TourDestination = { tab?: string; view?: string; explorer?: boolean };
export default function StudioTour({
  onNavigate,
  onFinish,
}: {
  onNavigate: (destination: TourDestination) => void;
  onFinish: () => void;
}) {
  const steps = useMemo<Step[]>(() => {
    const step = (
      target: string,
      title: string,
      content: string,
      destination: TourDestination = {},
    ): Step => ({
      target,
      title,
      content,
      before: async () => {
        onNavigate(destination);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      },
    });
    return [
      {
        target: 'body',
        placement: 'center',
        title: 'Welcome to TestAuthoring Studio',
        content:
          'Build a test by discovering existing capabilities, assembling a scenario, and reviewing the result. Use Next and Back to explore, or End tour to return to your work.',
      },
      step(
        '[data-tour="workspace"]',
        '1. Connect your .NET project',
        'Open workspace settings to choose your repository and test project. Configure recursive feature, C# source, and selector patterns for your Features, Steps, Pages, and shared libraries.',
      ),
      step(
        '[data-tour="explorer"]',
        '2. Explore your feature folders',
        'Expand folders to follow your real repository structure: feature area → subfeature → .feature file. Search by folder path, filename, or Gherkin feature name; matching branches open automatically.',
        { explorer: true },
      ),
      step(
        '[data-tour="new-feature"]',
        '3. Create a feature in the right place',
        'Select a folder, then use its + button to create a draft there. You can also type a deeper relative path. Parent folders are created only when you approve the file.',
        { explorer: true },
      ),
      step(
        '.catalog-toolbar',
        '4. Reuse existing step definitions',
        'Search the step catalog, inspect parameters and source evidence, then choose Add to scenario. Your .feature files describe behavior; the C# bindings implement it.',
        { tab: 'Step Catalog' },
      ),
      step(
        '.catalog-toolbar',
        '5. Reuse a background',
        'Find common setup steps and reuse a background. Review the generated Gherkin in the editor before saving it.',
        { tab: 'Backgrounds' },
      ),
      step(
        '.catalog-toolbar',
        '6. Check existing selectors',
        'Search repository selectors before proposing a new one. Inspect the owning page or helper and its source location so UI interactions stay in the appropriate layer.',
        { tab: 'Selectors' },
      ),
      step(
        '.builder-grid',
        '7. Assemble your scenario',
        'Name the scenario, arrange steps, and supply their parameters. Enable Scenario Outline to edit an Examples table. Open the result in the editor when it is ready.',
        { tab: 'Features', view: 'builder' },
      ),
      step(
        '.recording-toolbar',
        '8. Record a browser workflow',
        'Start recording to open a local Chromium browser. Capture interactions, pause or stop, then match the captured actions against your repository. The initial example recording is sample data.',
        { tab: 'Features', view: 'recorder' },
      ),
      step(
        '.matcher-panel',
        '9. Review matches and proposals',
        'Select an action and inspect the candidate evidence. Accept the correct match yourself. For a missing capability, review existing steps and page objects before proposing Gherkin or a C# scaffold.',
        { tab: 'Features', view: 'recorder' },
      ),
      step(
        '.editor-panel',
        '10. Validate and review before saving',
        'Edit the Gherkin and validate its bindings. Preview changes shows the diff; only Approve and write file saves it. Use Run tests with your executable SpecFlow project after saving.',
        { tab: 'Features', view: 'editor' },
      ),
    ];
  }, [onNavigate]);
  return (
    <Joyride
      run
      continuous
      scrollToFirstStep
      steps={steps}
      options={{
        skipBeacon: true,
        showProgress: true,
        buttons: ['back', 'close', 'primary', 'skip'],
        closeButtonAction: 'skip',
        overlayClickAction: false,
        blockTargetInteraction: true,
        backgroundColor: '#1b2031',
        arrowColor: '#1b2031',
        textColor: '#d9deed',
        primaryColor: '#9270dd',
        overlayColor: '#050710bd',
        zIndex: 1000,
        width: Math.min(390, window.innerWidth - 32),
        spotlightPadding: 5,
        spotlightRadius: 8,
        scrollDuration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200,
        targetWaitTimeout: 2500,
      }}
      locale={{
        back: 'Back',
        next: 'Next',
        nextWithProgress: 'Next ({current} / {total})',
        last: 'Finish tour',
        skip: 'End tour',
        close: 'End tour',
      }}
      styles={{
        tooltip: {
          maxWidth: 'calc(100vw - 32px)',
          border: '1px solid #514169',
          borderRadius: 12,
          boxShadow: '0 16px 55px #0008',
          fontFamily: 'inherit',
        },
        tooltipTitle: { fontSize: 17 },
        tooltipContent: { fontSize: 13, lineHeight: 1.8, textAlign: 'left' },
        buttonBack: { color: '#c7b6ea' },
        buttonSkip: { color: '#abb7d0', fontSize: 12 },
        buttonClose: { color: '#abb7d0' },
      }}
      onEvent={(event) => {
        if (
          event.type === 'tour:end' ||
          event.type === 'error' ||
          event.type === 'error:target_not_found' ||
          (event.action === 'close' && event.origin === 'keyboard')
        )
          onFinish();
      }}
    />
  );
}
