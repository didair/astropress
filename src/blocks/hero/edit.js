const { registerBlockType } = wp.blocks;
const { PanelBody, TextControl } = wp.components;
const {
  BlockControls,
  InspectorControls,
  MediaPlaceholder,
  MediaReplaceFlow,
  RichText,
  useBlockProps,
} = wp.blockEditor;
const { createElement: h } = wp.element;

const attributes = {
  headline: {
    type: 'string',
    source: 'html',
    selector: 'h1',
  },
  imageId: {
    type: 'number',
  },
  imageUrl: {
    type: 'string',
    source: 'attribute',
    selector: 'img',
    attribute: 'src',
  },
  imageAlt: {
    type: 'string',
    source: 'attribute',
    selector: 'img',
    attribute: 'alt',
  },
};

registerBlockType('astropress/hero', {
  apiVersion: 3,
  title: 'AstroPress Hero',
  category: 'design',
  icon: 'format-image',
  description: 'A simple AstroPress test block with a media-library image and headline.',
  supports: {
    html: false,
  },
  attributes,

  edit({ attributes, setAttributes }) {
    const { headline = '', imageId, imageUrl = '', imageAlt = '' } = attributes;
    const blockProps = useBlockProps({ className: 'astropress-hero' });

    const selectImage = (media) => setAttributes({
      imageId: media.id,
      imageUrl: media.url,
      imageAlt: media.alt || media.title || '',
    });

    return h('section', blockProps,
      imageUrl && h(BlockControls, { group: 'other' },
        h(MediaReplaceFlow, {
          mediaId: imageId,
          mediaURL: imageUrl,
          allowedTypes: ['image'],
          accept: 'image/*',
          name: 'Replace image',
          onSelect: selectImage,
        })
      ),
      h(InspectorControls, null,
        h(PanelBody, { title: 'Hero image', initialOpen: true },
          h(TextControl, {
            label: 'Alt text',
            value: imageAlt,
            help: 'Used by screen readers and when the image cannot load.',
            onChange: (value) => setAttributes({ imageAlt: value }),
          })
        )
      ),
      imageUrl
        ? h('figure', { className: 'astropress-hero__media' },
            h('img', { src: imageUrl, alt: imageAlt || '' })
          )
        : h(MediaPlaceholder, {
            icon: 'format-image',
            labels: {
              title: 'Hero image',
              instructions: 'Choose an image from the WordPress media library.',
            },
            onSelect: selectImage,
            accept: 'image/*',
            allowedTypes: ['image'],
            multiple: false,
          }),
      h(RichText, {
        tagName: 'h1',
        className: 'astropress-hero__headline',
        value: headline,
        placeholder: 'Write a hero headline…',
        allowedFormats: [],
        onChange: (value) => setAttributes({ headline: value }),
      })
    );
  },

  save({ attributes }) {
    const { headline = '', imageUrl = '', imageAlt = '' } = attributes;
    const blockProps = wp.blockEditor.useBlockProps.save({ className: 'astropress-hero' });

    return h('section', blockProps,
      imageUrl && h('figure', { className: 'astropress-hero__media' },
        h('img', { src: imageUrl, alt: imageAlt || '' })
      ),
      h(RichText.Content, {
        tagName: 'h1',
        className: 'astropress-hero__headline',
        value: headline,
      })
    );
  },
});
