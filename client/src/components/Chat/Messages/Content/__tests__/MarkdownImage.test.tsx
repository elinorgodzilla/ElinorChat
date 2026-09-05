import React from 'react';
import ReactMarkdown from 'react-markdown';
import { apiBaseUrl } from 'librechat-data-provider';
import { render, screen, fireEvent } from 'test/layout-test-utils';
import { img as MarkdownImage } from '../MarkdownComponents';

describe('MarkdownImage', () => {
  it('renders markdown images with native lazy loading and async decoding', () => {
    render(
      <ReactMarkdown components={{ img: (props) => <MarkdownImage {...props} /> }}>
        {'![A landscape](/images/landscape.png "Landscape")'}
      </ReactMarkdown>,
    );

    const img = screen.getByRole('img', { name: 'A landscape' });
    expect(img).toHaveAttribute('src', `${apiBaseUrl()}/images/landscape.png`);
    expect(img).toHaveAttribute('title', 'Landscape');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toBeVisible();
  });

  it.each(['https://example.com/image.png', 'data:image/png;base64,abc', '/other/image.png'])(
    'preserves the image source %s',
    (src) => {
      render(<MarkdownImage src={src} alt="Image" />);

      expect(screen.getByRole('img')).toHaveAttribute('src', src);
      expect(screen.getByRole('img')).toHaveAttribute('loading', 'lazy');
      expect(screen.getByRole('img')).toHaveAttribute('decoding', 'async');
    },
  );

  it.each(['load', 'error'])('preserves supplied sizing and classes through %s', (event) => {
    const style = { width: '320px', height: '180px', aspectRatio: '16 / 9' };
    render(
      <MarkdownImage
        src="/images/test.png"
        alt="Sized image"
        className="rounded-lg"
        style={style}
      />,
    );
    const img = screen.getByRole('img');

    expect(img).toHaveStyle(style);
    expect(img).toHaveClass('rounded-lg');

    fireEvent(img, new Event(event));

    expect(screen.getByRole('img')).toBe(img);
    expect(img).toHaveStyle(style);
    expect(img).toHaveAttribute('src', `${apiBaseUrl()}/images/test.png`);
  });
});
