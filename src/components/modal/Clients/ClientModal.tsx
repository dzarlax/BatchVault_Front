import React, { useRef, useEffect, useState, useId } from 'react';
import { Modal, Button, Form, Row, Col, InputGroup, Alert } from 'react-bootstrap';
import { FaTrash, FaUser, FaPhone, FaTelegram, FaInstagram, FaMapMarkerAlt, FaTag } from 'react-icons/fa';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';

const ClientModal = ({
  show,
  onHide,
  onDelete,
  onSave,
  client,
  name,
  surname,
  telegram,
  instagram,
  phone,
  address,
  source,
  setName,
  setSurname,
  setTelegram,
  setInstagram,
  setPhone,
  setAddress,
  setSource,
  mapboxToken,
  t,
}) => {
  const titleId = `client-modal-title-${useId()}`;
  const geocoderContainerRef = useRef(null);
  const geocoderRef = useRef(null);
  
  // Validation states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  
  // Format validation functions
  const validatePhone = (phone) => {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return !phone || phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  };
  
  const validateTelegram = (telegram) => {
    if (!telegram) return true;
    const cleaned = telegram.replace('@', '');
    const telegramRegex = /^[a-zA-Z0-9_]{5,32}$/;
    return telegramRegex.test(cleaned);
  };
  
  const validateInstagram = (instagram) => {
    if (!instagram) return true;
    const cleaned = instagram.replace('@', '');
    const instagramRegex = /^[a-zA-Z0-9_.]{1,30}$/;
    return instagramRegex.test(cleaned);
  };
  
  // Real-time validation
  const validateField = (field, value) => {
    const newErrors = { ...errors };
    
    switch (field) {
      case 'name':
        if (!value.trim()) {
          newErrors.name = t('nameRequired');
        } else {
          delete newErrors.name;
        }
        break;
      case 'surname':
        if (!value.trim()) {
          newErrors.surname = t('surnameRequired');
        } else {
          delete newErrors.surname;
        }
        break;
      case 'phone':
        if (value && !validatePhone(value)) {
          newErrors.phone = t('invalidPhoneFormat');
        } else {
          delete newErrors.phone;
        }
        break;
      case 'telegram':
        if (value && !validateTelegram(value)) {
          newErrors.telegram = t('invalidTelegramFormat');
        } else {
          delete newErrors.telegram;
        }
        break;
      case 'instagram':
        if (value && !validateInstagram(value)) {
          newErrors.instagram = t('invalidInstagramFormat');
        } else {
          delete newErrors.instagram;
        }
        break;
      case 'address':
        // Address is no longer required
        delete newErrors.address;
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleFieldChange = (field, value, setter) => {
    setter(value);
    setTouched({ ...touched, [field]: true });
    validateField(field, value);
  };
  
  const isFormValid = () => {
    return name.trim() && 
           surname.trim() && 
           Object.keys(errors).length === 0 &&
           (!phone || validatePhone(phone)) &&
           (!telegram || validateTelegram(telegram)) &&
           (!instagram || validateInstagram(instagram));
  };

  useEffect(() => {
    if (show) {
      // Reset validation state when modal opens
      setErrors({});
      setTouched({});
      
      if (mapboxToken && geocoderContainerRef.current) {
        if (geocoderRef.current) {
          geocoderRef.current.clear();
        }

        geocoderRef.current = new MapboxGeocoder({
          accessToken: mapboxToken,
          placeholder: t('address'),
          types: 'address',
          clearAndBlurOnEsc: false,
          clearOnBlur: false,
        });

        geocoderRef.current.addTo(geocoderContainerRef.current);

        geocoderRef.current.on('result', (e) => {
          handleFieldChange('address', e.result.place_name, setAddress);
        });

        // Geocoder debugging removed
      }
    }
  }, [show, mapboxToken, t]);

  return (
    <Modal show={show} onHide={onHide} size="lg" className="client-modal ui-workflow-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton closeLabel={t('close')}>
        {client && (
          <Button 
            variant="outline-danger" 
            size="sm"
            onClick={onDelete} 
            className="me-2"
            title={t('deleteClient')}
          >
            <FaTrash />
          </Button>
        )}
        <Modal.Title id={titleId} className="d-flex align-items-center">
          <FaUser className="me-2" />
          {client ? t('editClient') : t('addClient')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={onSave}>
          {/* Personal Information Section */}
          <div className="mb-4">
            <h6 className="text-muted mb-3 border-bottom pb-2">
              <FaUser className="me-2" />
              {t('personalInformation')}
            </h6>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="d-flex align-items-center">
                    <span className="text-danger me-1">*</span>
                    {t('name')}
                  </Form.Label>
                  <InputGroup>
                    <InputGroup.Text>
                      <FaUser className="client-modal-field-icon" />
                    </InputGroup.Text>
                    <Form.Control 
                      type="text" 
                      value={name} 
                      onChange={(e) => handleFieldChange('name', e.target.value, setName)}
                      onBlur={() => setTouched({ ...touched, name: true })}
                                             isInvalid={!!(touched.name && errors.name)}
                      placeholder={t('enterName')}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.name}
                    </Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="d-flex align-items-center">
                    <span className="text-danger me-1">*</span>
                    {t('surname')}
                  </Form.Label>
                  <InputGroup>
                    <InputGroup.Text>
                      <FaUser className="client-modal-field-icon" />
                    </InputGroup.Text>
                    <Form.Control 
                      type="text" 
                      value={surname} 
                      onChange={(e) => handleFieldChange('surname', e.target.value, setSurname)}
                      onBlur={() => setTouched({ ...touched, surname: true })}
                                             isInvalid={!!(touched.surname && errors.surname)}
                      placeholder={t('enterSurname')}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.surname}
                    </Form.Control.Feedback>
                  </InputGroup>
                </Form.Group>
              </Col>
            </Row>
          </div>

          {/* Contact Information Section */}
          <div className="mb-4">
            <h6 className="text-muted mb-3 border-bottom pb-2">
              <FaPhone className="me-2" />
              {t('contactInformation')}
            </h6>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>{t('phone')}</Form.Label>
                  <InputGroup>
                    <InputGroup.Text>
                      <FaPhone className="client-modal-field-icon" />
                    </InputGroup.Text>
                    <Form.Control 
                      type="tel" 
                      value={phone} 
                      onChange={(e) => handleFieldChange('phone', e.target.value, setPhone)}
                      onBlur={() => setTouched({ ...touched, phone: true })}
                                             isInvalid={!!(touched.phone && errors.phone)}
                       placeholder="+1 234 567-8900"
                     />
                     <Form.Control.Feedback type="invalid">
                       {errors.phone}
                     </Form.Control.Feedback>
                   </InputGroup>
                   <Form.Text className="text-muted">
                     {t('phoneFormatHelp')}
                   </Form.Text>
                 </Form.Group>
               </Col>
               <Col md={6}>
                 <Form.Group className="mb-3">
                   <Form.Label>{t('telegram')}</Form.Label>
                   <InputGroup>
                     <InputGroup.Text>
                       <FaTelegram className="client-modal-field-icon" />
                     </InputGroup.Text>
                     <Form.Control 
                       type="text" 
                       value={telegram} 
                       onChange={(e) => handleFieldChange('telegram', e.target.value, setTelegram)}
                       onBlur={() => setTouched({ ...touched, telegram: true })}
                       isInvalid={!!(touched.telegram && errors.telegram)}
                       placeholder="@username или username"
                     />
                     <Form.Control.Feedback type="invalid">
                       {errors.telegram}
                     </Form.Control.Feedback>
                   </InputGroup>
                   <Form.Text className="text-muted">
                     {t('telegramFormatHelp')}
                   </Form.Text>
                 </Form.Group>
               </Col>
             </Row>
             <Row>
               <Col md={6}>
                 <Form.Group className="mb-3">
                   <Form.Label>{t('instagram')}</Form.Label>
                   <InputGroup>
                     <InputGroup.Text>
                       <FaInstagram className="client-modal-field-icon" />
                     </InputGroup.Text>
                     <Form.Control 
                       type="text" 
                       value={instagram} 
                       onChange={(e) => handleFieldChange('instagram', e.target.value, setInstagram)}
                       onBlur={() => setTouched({ ...touched, instagram: true })}
                       isInvalid={!!(touched.instagram && errors.instagram)}
                      placeholder="@username или username"
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.instagram}
                    </Form.Control.Feedback>
                  </InputGroup>
                  <Form.Text className="text-muted">
                    {t('instagramFormatHelp')}
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>{t('source')}</Form.Label>
                  <InputGroup>
                    <InputGroup.Text>
                      <FaTag className="client-modal-field-icon" />
                    </InputGroup.Text>
                    <Form.Control 
                      type="text" 
                      value={source} 
                      onChange={(e) => setSource(e.target.value)}
                      placeholder={t('howDidYouFindUs')}
                    />
                  </InputGroup>
                </Form.Group>
              </Col>
            </Row>
          </div>

          {/* Address Section */}
          <div className="mb-4">
            <h6 className="text-muted mb-3 border-bottom pb-2">
              <FaMapMarkerAlt className="me-2" />
              {t('addressInformation')}
            </h6>
            <Form.Group className="mb-3" controlId={`${titleId}-address`}>
              <Form.Label className="d-flex align-items-center">
                {t('address')}
              </Form.Label>
              <div className="position-relative">
                {!mapboxToken && <Form.Control
                  type="text"
                  value={address}
                  onChange={(event) => handleFieldChange('address', event.target.value, setAddress)}
                  autoComplete="street-address"
                />}
                {mapboxToken && <div
                  ref={geocoderContainerRef} 
                  className={`geocoder-container ${touched.address && errors.address ? 'is-invalid' : ''}`}
                />}
                {touched.address && errors.address && (
                  <div className="invalid-feedback d-block">
                    {errors.address}
                  </div>
                )}
              </div>
              {address && (
                <div className="modal-token-panel mt-2 p-2">
                  <small className="text-muted d-block">{t('selectedAddress')}:</small>
                  <div className="d-flex align-items-center">
                    <FaMapMarkerAlt className="client-modal-field-icon me-2" />
                    <span className="modal-selected-value">{address}</span>
                  </div>
                </div>
              )}
            </Form.Group>
          </div>

          {/* Validation Summary */}
          {Object.keys(errors).length > 0 && (
            <Alert variant="warning" className="mb-3">
              <Alert.Heading className="h6 mb-2">{t('pleaseFixErrors')}:</Alert.Heading>
              <ul className="mb-0 small">
                {Object.entries(errors).map(([field, error]) => (
                  <li key={field}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between">
        <div className="client-modal-required-note">
          <span className="client-modal-required-mark me-1">*</span>
          {t('requiredFields')}
        </div>
        <Button 
          variant="primary" 
          onClick={onSave}
          disabled={!isFormValid()}
          className="d-flex align-items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="me-2" viewBox="0 0 16 16">
            <path d="M15.854.146a.5.5 0 0 1 0 .708l-8 8a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 7.793l7.646-7.647a.5.5 0 0 1 .708 0z"/>
          </svg>
          {client ? t('updateClient') : t('addClient')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default React.memo(ClientModal);
